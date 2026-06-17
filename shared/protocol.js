/**
 * WebSocket 事件协议定义（前后端共享）
 *
 * 依据 PRD 第10节定义所有 WebSocket 事件类型与 payload 结构。
 * 电脑端服务、桌面端 GUI、手机网页端共用本文件，保证协议一致。
 *
 * 通用消息结构：
 * {
 *   "type": "event_type",
 *   "token": "connection_token",
 *   "clientId": "mobile_client_id",
 *   "timestamp": 1710000000000,
 *   "payload": {}
 * }
 */

// 事件类型枚举：手机端 -> 电脑端 的控制事件
const EventType = {
  // 鼠标控制
  MOUSE_MOVE: 'mouse_move',
  MOUSE_CLICK: 'mouse_click',
  MOUSE_DOWN: 'mouse_down',
  MOUSE_UP: 'mouse_up',
  MOUSE_SCROLL: 'mouse_scroll',

  // 键盘控制
  KEYBOARD_TEXT: 'keyboard_text',
  KEYBOARD_KEY: 'keyboard_key',

  // 快捷键
  SHORTCUT: 'shortcut',

  // 手势
  GESTURE: 'gesture',

  // 边缘持续移动
  EDGE_MOVE_START: 'edge_move_start',
  EDGE_MOVE_STOP: 'edge_move_stop',

  // 连接管理
  CONNECT_REQUEST: 'connect_request',
  DISCONNECT: 'disconnect',

  // 心跳
  PING: 'ping',
  PONG: 'pong',

  // 鼠标动效反馈（手机端触碰屏幕时触发，电脑端在鼠标位置显示涟漪/气泡）
  CURSOR_EFFECT: 'cursor_effect',

  // 设置同步（手机端设置变更下发给电脑端，电脑端应用并落盘）
  SETTING_UPDATE: 'setting_update'
}

// 电脑端 -> 手机端 的事件
const ServerEventType = {
  CONNECT_APPROVED: 'connect_approved',
  CONNECT_REJECTED: 'connect_rejected',
  PONG: 'pong',
  FORCE_DISCONNECT: 'force_disconnect'
}

// 鼠标按键
const MouseButton = {
  LEFT: 'left',
  RIGHT: 'right',
  MIDDLE: 'middle'
}

// 手势类型
const GestureType = {
  TWO_FINGER_SWIPE_LEFT: 'two_finger_swipe_left',
  TWO_FINGER_SWIPE_RIGHT: 'two_finger_swipe_right',
  THREE_FINGER_SWIPE_LEFT: 'three_finger_swipe_left',
  THREE_FINGER_SWIPE_RIGHT: 'three_finger_swipe_right',
  THREE_FINGER_SWIPE_UP: 'three_finger_swipe_up',
  THREE_FINGER_SWIPE_DOWN: 'three_finger_swipe_down',
  THREE_FINGER_TAP: 'three_finger_tap'
}

// 边缘持续移动方向
const EdgeDirection = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down'
}

// 构造标准消息的辅助函数
function buildMessage(type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    payload
  }
}

module.exports = {
  EventType,
  ServerEventType,
  MouseButton,
  GestureType,
  EdgeDirection,
  buildMessage
}
