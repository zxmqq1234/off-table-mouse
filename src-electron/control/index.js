/**
 * 输入模拟执行层 —— 统一入口
 *
 * 职责：
 *  - 创建输入适配器（当前用 mock，注释说明 Windows 切 nutjs）。
 *  - 聚合鼠标 / 键盘 / 快捷键三个控制器。
 *  - 对外暴露 dispatchEvent(message, settings)：依据 message.type 把 WebSocket 控制
 *    事件分发到对应控制器（参考 shared/protocol.js 的 EventType）。
 *  - 对外暴露 initController(settings)：初始化适配器与各控制器。
 *
 * 对接点（板块A 连接管理 → 本板块）：
 *  板块A 在收到手机端 WebSocket 控制消息后，解析出标准 message 对象
 *  { type, payload, ... }（结构见 shared/protocol.js），调用：
 *      const { dispatchEvent } = require('./control')
 *      dispatchEvent(message, currentSettings)
 *  即可触发对应的鼠标/键盘/快捷键模拟。本板块不关心 WebSocket 连接细节。
 *
 * adapter 类型切换：
 *  - 默认 'mock'（Linux 开发与逻辑验证）。
 *  - Windows 真机：把下方 ADAPTER_TYPE 改为 'nutjs'，或设置环境变量 INPUT_ADAPTER=nutjs。
 */

const { EventType } = require('../../shared/protocol')
const { DEFAULT_SETTINGS } = require('../../shared/constants')
const { createInputAdapter } = require('./adapter')
const mouseController = require('./mouse-controller')
const keyboardController = require('./keyboard-controller')
const shortcutController = require('./shortcut-controller')

// adapter 类型：'mock'（默认）| 'nutjs'（Windows 真机）
// 支持 env 覆盖：INPUT_ADAPTER=nutjs
const ADAPTER_TYPE = process.env.INPUT_ADAPTER || 'mock'

// 模块级状态
let adapter = null
let currentSettings = null

/**
 * 初始化控制器
 * @param {object} [settings] 设置项（缺省用 DEFAULT_SETTINGS）
 */
function initController(settings) {
  currentSettings = settings || DEFAULT_SETTINGS
  // 创建适配器（mock 或 nutjs；nutjs 在 Linux 会自动降级 mock 并打错误日志）
  adapter = createInputAdapter(ADAPTER_TYPE)
  // 注入各控制器
  mouseController.init(adapter, currentSettings)
  keyboardController.init(adapter, currentSettings)
  shortcutController.init(adapter, currentSettings)
  console.log(`[control] 控制器已初始化，adapter=${ADAPTER_TYPE}`)
}

/**
 * 分发 WebSocket 控制事件到对应控制器
 * @param {{type:string, payload?:object}} message 标准事件消息
 * @param {object} [settings] 可选设置项（变化时会同步更新各控制器）
 */
function dispatchEvent(message, settings) {
  if (!message || typeof message.type !== 'string') {
    console.warn('[control] 非法消息（缺少 type），已忽略:', message)
    return
  }

  // 设置项变化时同步更新（鼠标/键盘/快捷键控制器的开关、灵敏度都依赖它）
  if (settings && settings !== currentSettings) {
    currentSettings = settings
    mouseController.updateSettings(settings)
    keyboardController.updateSettings(settings)
    shortcutController.updateSettings(settings)
  }

  const { type, payload } = message
  const data = payload || {}

  switch (type) {
    // —— 鼠标 ——
    case EventType.MOUSE_MOVE:
    case EventType.MOUSE_CLICK:
    case EventType.MOUSE_DOWN:
    case EventType.MOUSE_UP:
    case EventType.MOUSE_SCROLL:
      mouseController.handleMouseEvent(type, data, settings)
      break

    // —— 边缘持续移动 ——（归鼠标控制器处理）
    case EventType.EDGE_MOVE_START:
    case EventType.EDGE_MOVE_STOP:
      mouseController.handleMouseEvent(type, data, settings)
      break

    // —— 键盘 ——
    case EventType.KEYBOARD_TEXT:
    case EventType.KEYBOARD_KEY:
      keyboardController.handleKeyboardEvent(type, data)
      break

    // —— 快捷键 ——
    case EventType.SHORTCUT:
      shortcutController.handleShortcut(type, data)
      break

    // —— 手势 ——（由快捷键控制器翻译为快捷键）
    case EventType.GESTURE:
      shortcutController.handleGesture(type, data)
      break

    // —— 连接管理类事件不属于本板块，忽略（由板块A处理） ——
    case EventType.PING:
    case EventType.PONG:
    case EventType.CONNECT_REQUEST:
    case EventType.DISCONNECT:
      // 这些由连接管理层处理，这里不消费
      break

    default:
      // 未知事件类型：打警告但不崩溃
      console.warn(`[control] 未知事件类型，已忽略: ${type}`)
  }
}

/**
 * 销毁所有控制器（连接断开 / 应用退出时调用，清理定时器等资源）
 */
function disposeController() {
  mouseController.dispose()
  keyboardController.dispose()
  shortcutController.dispose()
  adapter = null
}

module.exports = {
  initController,
  dispatchEvent,
  disposeController,
  /** 暴露当前 adapter 类型，便于诊断 */
  getAdapterType: () => ADAPTER_TYPE
}
