/**
 * WebSocket 服务模块
 *
 * 职责：
 * - 使用 ws 库创建 WebSocket 服务，复用 HTTP 服务的 server 实例（共享端口）
 * - 实现连接鉴权：connect_request 时校验 Token，通过后交上层决策（电脑端弹窗确认）
 * - 路由消息：心跳、断开、控制事件等转发给上层处理器
 * - 维护单一已鉴权客户端（V1 只允许一个手机，见 PRD 7.6 节）
 *
 * 消息处理流程（依据 PRD 第10节）：
 *   connect_request → 校验 Token → 上层 onConnectRequest 决策 → connect_approved / connect_rejected
 *   ping            → 自动回复 pong（应用层心跳，手机端发起）
 *   pong            → 通知上层 onPong（电脑端发起心跳的响应）
 *   disconnect      → 清理并通知 onDisconnect
 *   其他控制事件    → 必须已鉴权 → onControlEvent(message) 转发上层
 */

const { WebSocket, WebSocketServer } = require('ws')
const { EventType, ServerEventType, buildMessage } = require('../../shared/protocol')
const tokenMgr = require('../core/token')

// WebSocket 服务实例
let wss = null
// 上层注入的处理器集合
let handlers = null
// 当前已鉴权的客户端（V1 单设备，整个服务只允许一个）
let connectedClient = null

/**
 * 向指定 ws 发送 JSON 消息（仅在连接处于 OPEN 状态时发送）
 * @param {WebSocket} ws
 * @param {object} message
 */
function send(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

/**
 * 从连接请求中提取 Token：优先消息体 token 字段，其次 URL query 参数
 * @param {object} message
 * @param {http.IncomingMessage} req
 * @returns {string|null}
 */
function extractToken(message, req) {
  if (message && message.token) return message.token
  if (req && req.url) {
    try {
      const u = new URL(req.url, 'http://localhost')
      return u.searchParams.get('token')
    } catch (_e) {
      return null
    }
  }
  return null
}

/**
 * 处理一条 WebSocket 消息（已 JSON.parse）
 * @param {WebSocket} ws
 * @param {object} message
 * @param {http.IncomingMessage} req
 */
async function handleMessage(ws, message, req) {
  switch (message.type) {
    case EventType.CONNECT_REQUEST: {
      // 连接请求：先校验 Token，无效直接拒绝；有效则交上层决策
      const token = extractToken(message, req)
      if (!tokenMgr.validateToken(token)) {
        send(ws, buildMessage(ServerEventType.CONNECT_REJECTED))
        ws.close()
        break
      }
      // Token 有效，交上层（connection.js）做单设备判断 + 用户确认
      let allowed = false
      if (handlers.onConnectRequest) {
        try {
          allowed = await handlers.onConnectRequest(token, ws, req)
        } catch (e) {
          console.error('[ws-server] onConnectRequest 异常:', e)
          allowed = false
        }
      }
      if (allowed) {
        ws.isAuthed = true
        connectedClient = ws
        send(ws, buildMessage(ServerEventType.CONNECT_APPROVED))
      } else {
        send(ws, buildMessage(ServerEventType.CONNECT_REJECTED))
        ws.close()
      }
      break
    }

    case EventType.PING:
      // 应用层心跳：手机端发 ping，电脑端立即回 pong
      send(ws, buildMessage(ServerEventType.PONG))
      // 通知上层（connection）刷新心跳活跃时间
      if (handlers.onPing) handlers.onPing()
      break

    case EventType.PONG:
      // 电脑端发起心跳的响应（仅在已鉴权客户端才有意义，见 connection.js）
      if (ws.isAuthed && handlers.onPong) {
        handlers.onPong()
      }
      break

    case EventType.DISCONNECT: {
      // 手机端主动断开
      const reason = (message.payload && message.payload.reason) || 'client_disconnect'
      cleanupClient(ws)
      if (handlers.onDisconnect) handlers.onDisconnect(reason)
      break
    }

    default: {
      // 其他均为控制事件（鼠标/键盘/手势/边缘移动等），必须已鉴权
      if (!ws.isAuthed) {
        // 未鉴权客户端发控制事件，忽略（避免恶意输入影响服务）
        return
      }
      if (handlers.onControlEvent) {
        try {
          handlers.onControlEvent(message)
        } catch (e) {
          console.error('[ws-server] onControlEvent 异常:', e)
        }
      }
    }
  }
}

/**
 * 清理指定客户端的连接状态（若它是当前已连接客户端）
 * @param {WebSocket} ws
 */
function cleanupClient(ws) {
  if (connectedClient === ws) {
    connectedClient = null
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.close()
    } catch (_e) {
      /* 忽略关闭异常 */
    }
  }
}

/**
 * 启动 WebSocket 服务
 *
 * @param {http.Server} httpServer HTTP 服务实例（与 HTTP 服务共享同一 server 和端口）
 * @param {object} h 处理器集合
 * @param {(token: string, ws: WebSocket, req: object) => Promise<boolean>} h.onConnectRequest
 *        连接请求决策，返回 true=允许连接
 * @param {(message: object) => void} h.onControlEvent 控制事件转发（鼠标/键盘/手势等）
 * @param {() => void} [h.onPong] 心跳 pong 响应回调
 * @param {(reason: string) => void} h.onDisconnect 连接断开通知
 */
function startWSServer(httpServer, h) {
  handlers = h || {}
  // 共享 HTTP server，ws 库会自动监听其 'upgrade' 事件处理 WebSocket 握手
  wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, req) => {
    // 标记是否已通过连接鉴权（未鉴权客户端不得发送控制事件）
    ws.isAuthed = false

    ws.on('message', raw => {
      let message
      try {
        message = JSON.parse(raw)
      } catch (_e) {
        // 非 JSON 消息直接忽略，避免异常输入影响服务
        return
      }
      handleMessage(ws, message, req).catch(err => {
        console.error('[ws-server] 处理消息异常:', err)
      })
    })

    ws.on('close', () => {
      // 仅当断开的是当前已连接客户端时才通知上层
      if (connectedClient === ws) {
        connectedClient = null
        if (handlers.onDisconnect) handlers.onDisconnect('socket_closed')
      }
    })

    ws.on('error', err => {
      console.error('[ws-server] 客户端连接异常:', err.message)
    })
  })

  wss.on('error', err => {
    console.error('[ws-server] WebSocket 服务异常:', err)
  })

  console.log('[ws-server] WebSocket 服务已启动')
}

/**
 * 停止 WebSocket 服务（关闭所有客户端连接与服务实例）
 * @returns {Promise<void>}
 */
function stopWSServer() {
  return new Promise(resolve => {
    if (!wss) {
      resolve()
      return
    }
    if (connectedClient) {
      try {
        connectedClient.close()
      } catch (_e) {
        /* 忽略 */
      }
      connectedClient = null
    }
    wss.close(() => {
      wss = null
      resolve()
    })
  })
}

/**
 * 向已连接的单一手机客户端发送消息
 * @param {object} message 消息体（将 JSON.stringify）
 * @returns {boolean} 是否发送成功（客户端存在且处于 OPEN）
 */
function sendToClient(message) {
  if (connectedClient && connectedClient.readyState === WebSocket.OPEN) {
    send(connectedClient, message)
    return true
  }
  return false
}

/**
 * 主动强制断开已连接的客户端（先发 force_disconnect 通知，再关闭）
 * @param {string} [reason] 断开原因
 */
function forceCloseClient(reason) {
  if (connectedClient) {
    send(
      connectedClient,
      buildMessage(ServerEventType.FORCE_DISCONNECT, {
        reason: reason || 'server_force_disconnect'
      })
    )
    try {
      connectedClient.close()
    } catch (_e) {
      /* 忽略 */
    }
    connectedClient = null
  }
}

/**
 * 获取当前已连接客户端（ws 实例），无连接返回 null
 * @returns {WebSocket|null}
 */
function getConnectedClient() {
  return connectedClient
}

module.exports = {
  startWSServer,
  stopWSServer,
  sendToClient,
  forceCloseClient,
  getConnectedClient
}
