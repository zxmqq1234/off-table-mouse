/**
 * 连接状态管理模块
 *
 * 职责：
 * - 维护单设备连接（V1 只允许一个手机，见 PRD 7.6 节）
 * - 连接状态机：idle → waiting（等待用户确认）→ connected → disconnected
 * - 心跳检测：定时发送应用层 ping，超时（HEARTBEAT_TIMEOUT）无 pong 判定断线
 * - 记录已连接设备信息（IP、连接时间）
 * - 通过 EventEmitter 向桌面端 GUI 推送状态变化与连接请求
 *
 * 设计说明：
 * - 本模块不直接持有 WebSocket 实例，而是通过 setWsServer(wsServer) 注入的
 *   ws-server 句柄间接操作（sendToClient 发 ping、forceCloseClient 断开），
 *   保持通信层与状态层的解耦。
 *
 * 对外事件（EventEmitter）：
 *   'status'          状态变化         { state, device }
 *   'connect_request' 连接请求到来     { token, device }（GUI 应弹窗确认）
 *   'disconnect'      连接断开         { reason }
 */

const { EventEmitter } = require('events')
const { HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT } = require('../../shared/constants')
const { EventType, buildMessage } = require('../../shared/protocol')

// 连接状态枚举
const ConnectionState = {
  IDLE: 'idle', // 无连接（稳态）
  WAITING: 'waiting', // 等待用户确认连接请求
  CONNECTED: 'connected', // 已连接
  DISCONNECTED: 'disconnected' // 已断开（瞬态，稍后自动回 IDLE）
}

// DISCONNECTED 状态停留时长，之后自动回到 IDLE（让 GUI 有时间显示"已断开"）
const DISCONNECTED_HOLD_MS = 1500

/**
 * 从 HTTP 请求头 User-Agent 解析简易设备名（任务1，PRD 7.1 P1 #45）
 *
 * 降级方案：不修改 ws-server 握手协议，直接用 req.headers['user-agent'] 做粗略解析。
 * 浏览器 UA 含手机型号/平台特征，能给出如 "iPhone Safari" / "Android Chrome" 的可读名称。
 * 这不是精确设备名（精确名需手机端主动上报，要改协议），仅用于 GUI 展示区分。
 *
 * @param {string} [ua] User-Agent 字符串
 * @returns {string} 简易设备名（解析失败返回 '未知设备'）
 */
function parseDeviceName(ua) {
  if (!ua || typeof ua !== 'string') return '未知设备'
  const lower = ua.toLowerCase()
  // 平台判定（顺序：iPhone → iPad → Android → Mac → Windows → 其它）
  let platform = '设备'
  if (lower.includes('iphone')) platform = 'iPhone'
  else if (lower.includes('ipad')) platform = 'iPad'
  else if (lower.includes('android')) platform = 'Android'
  else if (lower.includes('mac os')) platform = 'Mac'
  else if (lower.includes('windows')) platform = 'Windows'
  // 浏览器判定（顺序：Edge → Chrome → Firefox → Safari → 其它）
  let browser = ''
  if (lower.includes('edg/')) browser = 'Edge'
  else if (lower.includes('chrome') || lower.includes('crios')) browser = 'Chrome'
  else if (lower.includes('firefox') || lower.includes('fxios')) browser = 'Firefox'
  else if (lower.includes('safari')) browser = 'Safari'
  return browser ? `${platform} ${browser}` : platform
}

class ConnectionManager extends EventEmitter {
  constructor() {
    super()
    this.state = ConnectionState.IDLE
    this.device = null // { ip, deviceName, connectedAt } 已连接设备信息
    // 等待用户确认时的 Promise resolve 函数
    this.pendingResolve = null
    // 心跳定时器
    this.heartbeatTimer = null
    this.timeoutTimer = null
    this.lastPong = 0
    // ws-server 句柄（setWsServer 注入，用于发 ping / 强制断开）
    this.wsServer = null
    // DISCONNECTED → IDLE 的延时定时器
    this.idleTimer = null
    // 是否免确认自动批准连接（由 main/index.js 根据设置同步）
    this.autoApprove = false
  }

  /**
   * 注入 ws-server 句柄（启动心跳与强制断开依赖它）
   * @param {object} wsServer ws-server 模块导出对象
   */
  setWsServer(wsServer) {
    this.wsServer = wsServer
  }

  /**
   * 设置是否免确认自动批准连接
   * @param {boolean} auto true=扫码后自动连接不弹确认框
   */
  setAutoApprove(auto) {
    this.autoApprove = !!auto
  }

  /**
   * 连接请求处理（作为 ws-server 的 onConnectRequest 回调）
   *
   * 流程：
   * 1. 若当前为 WAITING 或 CONNECTED 状态，拒绝新请求（单设备限制）
   * 2. 否则进入 WAITING，触发 'connect_request' 事件让 GUI 弹窗确认
   * 3. 等待 approveConnect / rejectConnect 决定 Promise 结果
   *
   * @param {string} token 连接 Token（ws-server 已校验有效性）
   * @param {WebSocket} _ws WebSocket 实例（本模块不直接使用，留作扩展）
   * @param {http.IncomingMessage} req HTTP 升级请求（用于取客户端 IP）
   * @returns {Promise<boolean>} true=允许连接
   */
  async requestConnect(token, _ws, req) {
    // V1 单设备：已有待确认请求或已连接时，拒绝新请求
    if (
      this.state === ConnectionState.WAITING ||
      this.state === ConnectionState.CONNECTED
    ) {
      return false
    }

    // 取消可能存在的 DISCONNECTED → IDLE 定时器，立即进入新流程
    this.clearIdleTimer()

    const clientInfo = {
      ip: req && req.socket ? req.socket.remoteAddress : null,
      // 设备名：从 User-Agent 粗略解析（任务1），便于 GUI 展示区分手机
      deviceName: parseDeviceName(req && req.headers ? req.headers['user-agent'] : null),
      requestedAt: Date.now()
    }

    // 免确认模式：直接批准连接（仍通知 GUI 设备信息，但不弹确认框）
    if (this.autoApprove) {
      const device = {
        ip: clientInfo.ip,
        deviceName: clientInfo.deviceName,
        connectedAt: Date.now()
      }
      this.setState(ConnectionState.CONNECTED, device)
      this.startHeartbeat()
      // 通知 GUI 有设备连接（用于显示连接信息，但不触发确认弹窗）
      this.emit('connect_request', { token, device: clientInfo, autoApproved: true })
      return true
    }

    return new Promise(resolve => {
      this.pendingResolve = resolve
      this.setState(ConnectionState.WAITING, clientInfo)
      // 通知 GUI 弹窗确认
      this.emit('connect_request', { token, device: clientInfo })
    })
  }

  /**
   * 用户点击"允许"：批准连接，启动心跳
   */
  approveConnect() {
    if (this.state !== ConnectionState.WAITING || !this.pendingResolve) {
      return
    }
    const device = {
      ip: this.device ? this.device.ip : null,
      // 透传 WAITING 阶段解析到的设备名到已连接设备信息（任务1）
      deviceName: this.device ? this.device.deviceName : null,
      connectedAt: Date.now()
    }
    this.setState(ConnectionState.CONNECTED, device)
    this.startHeartbeat()
    // 通知 ws-server 允许连接（其会标记鉴权并发 connect_approved）
    this.pendingResolve(true)
    this.pendingResolve = null
  }

  /**
   * 用户点击"拒绝"：拒绝连接，回到 IDLE
   */
  rejectConnect() {
    if (this.state !== ConnectionState.WAITING || !this.pendingResolve) {
      return
    }
    this.pendingResolve(false)
    this.pendingResolve = null
    this.setState(ConnectionState.IDLE, null)
  }

  /**
   * 主动断开连接（电脑端点击断开 / 服务停止时调用）
   * @param {string} [reason]
   */
  forceDisconnect(reason = 'server_force_disconnect') {
    if (this.wsServer && typeof this.wsServer.forceCloseClient === 'function') {
      this.wsServer.forceCloseClient(reason)
    }
    this.cleanup('force_disconnect:' + reason)
  }

  /**
   * 启动心跳检测（被动模式）
   *
   * 心跳架构说明（修复双向心跳冲突）：
   *  - 手机端每 HEARTBEAT_INTERVAL 主动发 ping，电脑端 ws-server 自动回 pong
   *  - 电脑端【不主动发 ping】（旧版双向互发导致电脑端 ping 手机不回 pong → 误判超时断开）
   *  - 电脑端只做超时检测：若 HEARTBEAT_TIMEOUT 内未收到手机的任何 ping（onPing 调用），
   *    判定断线。收到 ping 即刷新 lastPong。
   */
  startHeartbeat() {
    this.stopHeartbeat()
    this.lastPong = Date.now()

    // 仅保留超时检测定时器（不主动发 ping）
    this.timeoutTimer = setInterval(() => {
      if (Date.now() - this.lastPong > HEARTBEAT_TIMEOUT) {
        this.cleanup('heartbeat_timeout')
      }
    }, HEARTBEAT_INTERVAL)
  }

  /**
   * 停止心跳定时器
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.timeoutTimer) {
      clearInterval(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  /**
   * 心跳响应（ws-server 收到客户端 pong 时回调，更新最近响应时间）
   */
  onPong() {
    this.lastPong = Date.now()
  }

  /**
   * 连接断开回调（ws-server 的 onDisconnect）
   * @param {string} reason
   */
  onDisconnect(reason) {
    this.cleanup(reason || 'socket_closed')
  }

  /**
   * 清理连接状态：停止心跳，进入 DISCONNECTED，延时回 IDLE
   * @param {string} reason
   */
  cleanup(reason) {
    this.stopHeartbeat()
    this.setState(ConnectionState.DISCONNECTED, null)
    this.emit('disconnect', { reason })
    // 延时回到 IDLE 稳态，便于 GUI 显示"已断开"过渡
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.state === ConnectionState.DISCONNECTED) {
        this.setState(ConnectionState.IDLE, null)
      }
    }, DISCONNECTED_HOLD_MS)
  }

  /**
   * 清除 DISCONNECTED → IDLE 的延时定时器
   */
  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }

  /**
   * 切换状态并广播 'status' 事件
   * @param {string} state 新状态
   * @param {object|null|undefined} device 设备信息（undefined 表示不更新）
   */
  setState(state, device) {
    this.state = state
    if (device !== undefined) this.device = device
    this.emit('status', { state, device: this.device })
  }

  /**
   * 订阅状态变化（任务要求的 onStatusChange 别名）
   * @param {(payload: {state, device}) => void} callback
   */
  onStatusChange(callback) {
    this.on('status', callback)
  }

  /**
   * 销毁管理器：停止所有定时器，移除所有监听
   */
  destroy() {
    this.stopHeartbeat()
    this.clearIdleTimer()
    this.removeAllListeners()
  }
}

// 全局单例（V1 整个应用只有一个连接管理器）
const manager = new ConnectionManager()

module.exports = {
  manager,
  ConnectionState,
  // 导出类便于单元测试
  ConnectionManager
}
