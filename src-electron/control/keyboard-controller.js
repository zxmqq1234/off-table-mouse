/**
 * 键盘控制器（业务逻辑层）
 *
 * 职责：包装 adapter 的键盘操作，处理两类键盘事件：
 *  - keyboard_text：实时文本输入（每输入一个字符同步一次）。受 settings.enableRealtimeInput 开关控制。
 *  - keyboard_key：单个功能键（Enter/Esc/Backspace/Delete/Tab）。
 *
 * 对接契约：
 *   入参 type/payload 严格遵循 shared/protocol.js 的 EventType.KEYBOARD_*。
 */

const { EventType } = require('../../shared/protocol')

// 模块级状态
let adapter = null
let settings = null

/**
 * 安全执行（兼容同步/异步），吞异常并打日志
 */
function safeRun(p, context) {
  if (p && typeof p.then === 'function') {
    p.catch((err) => {
      console.error(`[keyboard-controller] ${context} 执行失败:`, err && err.message ? err.message : err)
    })
  }
}

/**
 * 初始化键盘控制器
 * @param {object} ada 输入适配器
 * @param {object} stt 设置项
 */
function init(ada, stt) {
  adapter = ada
  settings = stt || null
}

/** 更新设置项 */
function updateSettings(stt) {
  settings = stt || settings
}

/**
 * 处理键盘事件总入口
 * @param {string} type 事件类型（EventType.KEYBOARD_*）
 * @param {object} payload 事件载荷
 */
function handleKeyboardEvent(type, payload = {}) {
  if (!adapter) {
    console.warn('[keyboard-controller] adapter 未初始化，忽略事件:', type)
    return
  }

  try {
    switch (type) {
      case EventType.KEYBOARD_TEXT: {
        // 实时输入开关关闭时，丢弃文本事件（PRD 7.3 输入暂停）
        if (settings && settings.enableRealtimeInput === false) {
          return
        }
        const text = payload.text
        if (text === undefined || text === null || text === '') return
        safeRun(adapter.typeText(text), 'keyboard_text')
        break
      }
      case EventType.KEYBOARD_KEY: {
        const key = payload.key
        if (!key) {
          console.warn('[keyboard-controller] keyboard_key 缺少 key 字段')
          return
        }
        // 单键不受 enableRealtimeInput 限制（删除/换行/功能键始终生效）
        safeRun(adapter.tapKey(key), 'keyboard_key')
        break
      }
      default:
        console.warn(`[keyboard-controller] 未处理的键盘事件类型: ${type}`)
    }
  } catch (err) {
    console.error(`[keyboard-controller] 处理 ${type} 时异常:`, err && err.message ? err.message : err)
  }
}

/** 销毁 */
function dispose() {
  adapter = null
  settings = null
}

module.exports = {
  init,
  updateSettings,
  handleKeyboardEvent,
  dispose
}
