/**
 * 服务聚合入口
 *
 * 职责：聚合 network / token / qrcode / http-server / ws-server / connection，
 * 对外提供统一的服务生命周期管理、二维码刷新与事件订阅。
 *
 * 启动流程（startServices）：
 *   1. getLocalIP() 获取局域网 IP（失败抛错）
 *   2. createToken() 生成一次性 Token
 *   3. startHTTPServer(port, dist-mobile 目录) 启动 HTTP 服务
 *   4. startWSServer(httpServer, handlers) 启动 WebSocket 服务
 *      handlers 注入 connection 作为连接决策器
 *   5. generateQRCode(generateConnectURL(ip, port, token)) 生成二维码
 *   6. 返回 { ip, port, token, url, qrCodeDataURL } 供 GUI 显示
 *
 * 对外 EventEmitter 事件（通过 on/once 订阅）：
 *   'status'          连接状态变化         { state, device }
 *   'connect_request' 连接请求到来         { token, device }（GUI 弹窗）
 *   'qrcode'          新二维码生成         { token, url, qrCodeDataURL }
 *   'disconnect'      连接断开             { reason }
 *   'control'         控制事件转发         message（供板块B控制层订阅）
 *   'error'           服务异常             Error
 */

const path = require('path')
const { EventEmitter } = require('events')

const { getLocalIP } = require('../core/network')
const tokenMgr = require('../core/token')
const { generateConnectURL, generateQRCode } = require('../core/qrcode')
const httpServer = require('./http-server')
const wsServer = require('./ws-server')
const { manager: connection } = require('../core/connection')

// 对外统一事件总线
const bus = new EventEmitter()

// 运行状态
let running = false
let currentInfo = null // { ip, port, token, url, qrCodeDataURL }

// 把连接管理器的事件桥接到对外总线
connection.on('status', s => bus.emit('status', s))
connection.on('connect_request', r => bus.emit('connect_request', r))
connection.on('disconnect', d => bus.emit('disconnect', d))

/**
 * 启动所有服务并返回二维码信息
 * @param {object} [options]
 * @param {number} [options.port] 起始端口（默认 constants.DEFAULT_PORT）
 * @returns {Promise<{ip: string, port: number, token: string, url: string, qrCodeDataURL: string}>}
 */
async function startServices(options = {}) {
  if (running) {
    throw new Error('服务已在运行，请先调用 stopServices')
  }

  try {
    // 1. 获取局域网 IP
    const ip = getLocalIP()
    if (!ip) {
      throw new Error('未检测到局域网 IP，请检查网络连接是否在同一局域网')
    }

    // 2. 生成一次性 Token
    const tokenRec = tokenMgr.createToken()
    const token = tokenRec.token

    // 3. 启动 HTTP 服务（生产环境托管 dist-mobile 静态文件）
    const staticDir = path.join(__dirname, '..', '..', '..', 'dist-mobile')
    const { server, port } = await httpServer.startHTTPServer(options.port, staticDir)

    // 4. 启动 WebSocket 服务，注入连接管理器作为决策器
    //    connection 通过 setWsServer 间接操作客户端，不直接持有 ws
    connection.setWsServer(wsServer)
    wsServer.startWSServer(server, {
      // 连接请求：交 connection 做单设备判断 + 用户确认
      onConnectRequest: (tokenArg, ws, req) => connection.requestConnect(tokenArg, ws, req),
      // 控制事件：转发给总线，供板块B（控制层）订阅
      onControlEvent: message => bus.emit('control', message),
      // 手机 ping：刷新电脑端心跳活跃时间（被动心跳模式）
      onPing: () => connection.onPong(),
      // 心跳响应
      onPong: () => connection.onPong(),
      // 连接断开
      onDisconnect: reason => connection.onDisconnect(reason)
    })

    // 5. 生成二维码 Data URL
    const url = generateConnectURL(ip, port, token)
    const qrCodeDataURL = await generateQRCode(url)

    running = true
    currentInfo = { ip, port, token, url, qrCodeDataURL }
    console.log(`[services] 服务启动成功 → ${url}`)
    return currentInfo
  } catch (err) {
    // 启动失败：清理已启动的子服务，避免资源泄漏
    bus.emit('error', err)
    try {
      await wsServer.stopWSServer()
    } catch (_e) {
      /* 忽略清理异常 */
    }
    try {
      await httpServer.stopHTTPServer()
    } catch (_e) {
      /* 忽略清理异常 */
    }
    throw err
  }
}

/**
 * 刷新二维码：重新生成 Token（旧 Token 立即失效）+ 重新生成二维码
 * @returns {Promise<{token: string, url: string, qrCodeDataURL: string}>}
 */
async function refreshQRCode() {
  if (!running || !currentInfo) {
    throw new Error('服务未运行，无法刷新二维码')
  }
  const tokenRec = tokenMgr.createToken()
  const token = tokenRec.token
  const url = generateConnectURL(currentInfo.ip, currentInfo.port, token)
  const qrCodeDataURL = await generateQRCode(url)
  currentInfo = { ...currentInfo, token, url, qrCodeDataURL }
  bus.emit('qrcode', { token, url, qrCodeDataURL })
  return { token, url, qrCodeDataURL }
}

/**
 * 主动断开已连接的手机
 * @param {string} [reason]
 */
function disconnectClient(reason) {
  connection.forceDisconnect(reason)
}

/**
 * 批准当前连接请求（GUI 点击"允许"时调用）
 */
function approveConnect() {
  connection.approveConnect()
}

/**
 * 拒绝当前连接请求（GUI 点击"拒绝"时调用）
 */
function rejectConnect() {
  connection.rejectConnect()
}

/**
 * 停止所有服务（断开连接 → 关 WS → 关 HTTP → 清 Token）
 * @returns {Promise<void>}
 */
async function stopServices() {
  try {
    connection.forceDisconnect('server_stopped')
  } catch (_e) {
    /* 忽略 */
  }
  await wsServer.stopWSServer()
  await httpServer.stopHTTPServer()
  tokenMgr.revokeAll()
  running = false
  currentInfo = null
}

module.exports = {
  startServices,
  stopServices,
  refreshQRCode,
  disconnectClient,
  approveConnect,
  rejectConnect,
  // 事件订阅
  on: (event, cb) => bus.on(event, cb),
  once: (event, cb) => bus.once(event, cb),
  off: (event, cb) => bus.off(event, cb),
  // 状态查询
  getState: () => connection.state,
  getDeviceInfo: () => connection.device,
  getInfo: () => currentInfo,
  isRunning: () => running
}
