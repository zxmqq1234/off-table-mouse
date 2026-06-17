/**
 * 控制事件工厂（业务 → 协议消息）
 *
 * 把识别出的手势 / 操作翻译成 WebSocket 消息。
 * 所有函数返回 protocol.js 的 buildMessage 结果（{ type, timestamp, payload }），
 * token / clientId 由 ws-client 在发送时注入（见 PRD 第10.1节通用字段）。
 *
 * 调用方拿到返回值后，传给 wsClient.send(message)。
 */
import { EventType, buildMessage } from '@shared/protocol.js'

/**
 * 鼠标相对移动
 * @param {number} dx X 轴位移（px）
 * @param {number} dy Y 轴位移（px）
 * @param {number} speed 速度（px/ms，用于电脑端加速度计算）
 */
export function moveMessage(dx, dy, speed = 0) {
  return buildMessage(EventType.MOUSE_MOVE, { dx, dy, speed })
}

/**
 * 鼠标点击（单击 / 双击）
 * @param {string} button MouseButton.LEFT / RIGHT / MIDDLE
 * @param {number} clicks 点击次数（默认 1）
 */
export function clickMessage(button, clicks = 1) {
  return buildMessage(EventType.MOUSE_CLICK, { button, clicks })
}

/** 鼠标按下（进入拖拽 / 选中） */
export function downMessage(button) {
  return buildMessage(EventType.MOUSE_DOWN, { button })
}

/** 鼠标松开（结束拖拽） */
export function upMessage(button) {
  return buildMessage(EventType.MOUSE_UP, { button })
}

/**
 * 鼠标滚轮滚动
 * @param {number} deltaX 横向滚动量
 * @param {number} deltaY 纵向滚动量（上负下正，遵循鼠标滚轮约定）
 */
export function scrollMessage(deltaX, deltaY) {
  return buildMessage(EventType.MOUSE_SCROLL, { deltaX, deltaY })
}

/** 实时文本输入（单个字符或中文上屏文字） */
export function textMessage(text) {
  return buildMessage(EventType.KEYBOARD_TEXT, { text })
}

/** 单个按键（Enter / Backspace / Esc 等） */
export function keyMessage(key) {
  return buildMessage(EventType.KEYBOARD_KEY, { key })
}

/**
 * 快捷键组合
 * @param {string[]} keys 如 ['Ctrl','C']、['Win','D']（顺序对应按下顺序）
 */
export function shortcutMessage(keys) {
  return buildMessage(EventType.SHORTCUT, { keys })
}

/**
 * 手势事件（双指 / 三指滑动，电脑端翻译为对应快捷键）
 * @param {string} gesture GestureType 枚举值
 */
export function gestureMessage(gesture) {
  return buildMessage(EventType.GESTURE, { gesture })
}

/**
 * 边缘持续移动开始（手指滑到触控区边缘并停留）
 * @param {string} direction EdgeDirection 枚举值
 * @param {number} speed 持续移动速度倍率
 */
export function edgeMoveStartMessage(direction, speed = 1.0) {
  return buildMessage(EventType.EDGE_MOVE_START, { direction, speed })
}

/** 边缘持续移动停止（手指离开边缘或抬起） */
export function edgeMoveStopMessage() {
  return buildMessage(EventType.EDGE_MOVE_STOP, {})
}
