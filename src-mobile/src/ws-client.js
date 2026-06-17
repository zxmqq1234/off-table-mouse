/**
 * WebSocket 客户端封装（手机端 → 电脑端）
 *
 * 职责：
 * 1. 建立 WebSocket 连接，连接成功后发送 connect_request（携带 token）
 * 2. 处理电脑端回执：connect_approved / connect_rejected / force_disconnect
 * 3. 应用层心跳：每 HEARTBEAT_INTERVAL 发 ping，HEARTBEAT_TIMEOUT 未收 pong 判定断线
 * 4. 非主动断开时自动重连（延迟 2s，最多 3 次）
 * 5. 提供 send(message) 发送控制事件（自动注入 token / clientId 通用字段）
 *
 * 协议契约见 shared/protocol.js 与 PRD 第10节。
 * 通用字段：{ type, token, clientId, timestamp, payload }（buildMessage 仅生成
 * type/timestamp/payload，token/clientId 在此注入）。
 */
import { EventType, ServerEventType, buildMessage } from '@shared/protocol.js'
import { HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT } from '@shared/constants.js'

// 自动重连配置（PRD 7.6：非主动断开时自动尝试重连）
const RECONNECT_DELAY = 2000 // 重连间隔 2 秒
const MAX_RECONNECT = 3 // 最多重连 3 次

/**
 * 生成客户端唯一标识（优先用原生 UUID）
 * @returns {string}
 */
function genClientId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch (_e) { /* 降级 */ }
  return 'm-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/**
 * 创建 WebSocket 客户端
 * @param {object} opts
 * @param {string} opts.url WebSocket 地址（如 ws://192.168.1.8:8765/ws）
 * @param {string} opts.token 一次性连接 Token
 * @param {(status:string, detail?:any)=>void} [opts.onStatus] 连接状态变更回调
 * @param {(message:object)=>void} [opts.onMessage] 收到电脑端消息（通用）
 * @param {(reason:string)=>void} [opts.onDisconnect] 连接彻底断开（不重连或重连耗尽）
 * @returns {{clientId:string, connect:()=>void, send:(msg:object)=>boolean, close:(reason?:string)=>void, getReadyState:()=>number}}
 */
export function createClient({ url, token, onStatus, onMessage, onDisconnect }) {
  const clientId = genClientId()

  let ws = null
  // 是否为主动关闭（true 时不重连）
  let manualClose = false
  // 已重连次数
  let reconnectCount = 0
  // 心跳发送定时器
  let heartbeatTimer = null
  // 心跳超时定时器（ping 后启动，收到 pong 清除）
  let heartbeatTimeoutTimer = null
  // 重连延迟定时器
  let reconnectTimer = null
  // 是否已发出 connect_request（避免重复）
  let requestSent = false

  /** 安全调用回调，吞异常避免影响主流程 */
  const safe = (fn, ...args) => {
    try { fn?.(...args) } catch (e) { console.error('[ws-client] 回调异常:', e) }
  }

  /** 给消息注入 token / clientId 通用字段后返回字符串 */
  const serialize = (message) => JSON.stringify({ ...message, token, clientId })

  /**
   * 发送一条消息
   * @param {object} message buildMessage 产物
   * @returns {boolean} 是否成功送入缓冲区
   */
  function send(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(serialize(message))
        return true
      } catch (e) {
        console.error('[ws-client] send 失败:', e)
        return false
      }
    }
    return false
  }

  /** 启动心跳：定时发 ping，并监听 pong 超时 */
  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      // 发送 ping，电脑端会立即回 pong
      send(buildMessage(EventType.PING))
      // 启动本次心跳的超时等待
      clearTimeout(heartbeatTimeoutTimer)
      heartbeatTimeoutTimer = setTimeout(() => {
        // 超过 HEARTBEAT_TIMEOUT 仍未收到 pong → 判定断线
        safe(onStatus, 'disconnected', 'heartbeat_timeout')
        // 非主动关闭，走重连流程
        handleUnexpectedDisconnect('heartbeat_timeout')
      }, HEARTBEAT_TIMEOUT)
    }, HEARTBEAT_INTERVAL)
  }

  /** 停止心跳相关定时器 */
  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
    if (heartbeatTimeoutTimer) { clearTimeout(heartbeatTimeoutTimer); heartbeatTimeoutTimer = null }
  }

  /** 清理当前 ws 的事件与引用（置空回调，避免 close 再触发） */
  function detachSocket() {
    stopHeartbeat()
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      try { ws.close() } catch (_e) { /* 忽略 */ }
      ws = null
    }
    requestSent = false
  }

  /**
   * 非主动断开后的重连调度
   * @param {string} reason 断线原因
   */
  function handleUnexpectedDisconnect(reason) {
    detachSocket()
    if (manualClose) return
    if (reconnectCount >= MAX_RECONNECT) {
      // 重连次数耗尽，彻底失败
      safe(onStatus, 'failed', 'max_reconnect')
      safe(onDisconnect, 'max_reconnect:' + reason)
      return
    }
    reconnectCount += 1
    safe(onStatus, 'reconnecting', reconnectCount)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (!manualClose) connect()
    }, RECONNECT_DELAY)
  }

  /** 建立连接并绑定事件 */
  function connect() {
    // 清理可能残留的旧连接与定时器
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    detachSocket()

    safe(onStatus, 'connecting')
    try {
      ws = new WebSocket(url)
    } catch (e) {
      // 地址非法等，直接进入重连
      safe(onStatus, 'error', e.message)
      handleUnexpectedDisconnect('invalid_url')
      return
    }

    // 连接已建立：发送 connect_request，启动心跳
    ws.onopen = () => {
      reconnectCount = 0
      // 发送连接请求（token / clientId 在 serialize 注入）
      if (!requestSent) {
        send(buildMessage(EventType.CONNECT_REQUEST, {
          clientId,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        }))
        requestSent = true
      }
      safe(onStatus, 'pending') // 等待电脑端确认
      startHeartbeat()
    }

    // 收到消息：分发状态 + 透传给业务
    ws.onmessage = (event) => {
      let data
      try { data = JSON.parse(event.data) } catch (_e) { return }
      safe(onMessage, data)
      switch (data.type) {
        case ServerEventType.CONNECT_APPROVED:
          // 电脑端确认，进入已连接
          safe(onStatus, 'connected')
          break
        case ServerEventType.CONNECT_REJECTED:
          // 被拒绝，不重连
          safe(onStatus, 'rejected', data.payload?.reason)
          manualClose = true
          detachSocket()
          safe(onDisconnect, 'rejected')
          break
        case ServerEventType.FORCE_DISCONNECT:
          // 电脑端强制断开，不重连（避免被反复踢）
          safe(onStatus, 'disconnected', 'force_disconnect')
          manualClose = true
          detachSocket()
          safe(onDisconnect, 'force_disconnect')
          break
        case ServerEventType.PONG:
          // 收到心跳响应，清除本次超时等待
          if (heartbeatTimeoutTimer) {
            clearTimeout(heartbeatTimeoutTimer)
            heartbeatTimeoutTimer = null
          }
          break
        default:
          break
      }
    }

    // 连接关闭：区分主动 / 非主动
    ws.onclose = (event) => {
      stopHeartbeat()
      if (manualClose) {
        safe(onDisconnect, 'manual')
        return
      }
      safe(onStatus, 'disconnected', event?.reason || 'closed')
      handleUnexpectedDisconnect(event?.reason || 'closed')
    }

    ws.onerror = () => {
      // onclose 会随后触发，这里仅上报状态
      safe(onStatus, 'error', 'ws_error')
    }
  }

  /**
   * 主动断开：发送 disconnect 事件后关闭（PRD 10.13）
   * @param {string} reason 断开原因
   */
  function close(reason = 'user_disconnect') {
    manualClose = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    // 先发 disconnect 通知电脑端
    if (ws && ws.readyState === WebSocket.OPEN) {
      send(buildMessage(EventType.DISCONNECT, { reason }))
    }
    detachSocket()
    safe(onDisconnect, 'manual')
  }

  /** 当前 WebSocket readyState（0~3），无连接返回 -1 */
  function getReadyState() {
    return ws ? ws.readyState : -1
  }

  return {
    clientId,
    connect,
    send,
    close,
    getReadyState
  }
}
