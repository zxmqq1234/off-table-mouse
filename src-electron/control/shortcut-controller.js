/**
 * 快捷键/手势控制器（业务逻辑层）
 *
 * 职责：
 *  - shortcut 事件：直接把 payload.keys（人类名数组，如 ['Ctrl','C']）交给 adapter.pressShortcut。
 *  - gesture 事件：把手势名翻译成对应的快捷键组合再执行。手势受开关控制：
 *      • 双指手势受 settings.enableTwoFingerGesture 控制
 *      • 三指手势受 settings.enableThreeFingerGesture 控制
 *
 * 手势 → 快捷键映射（依据任务说明 + PRD 9.5/9.6）：
 *   two_finger_swipe_left  → ['Alt', 'Left']
 *   two_finger_swipe_right → ['Alt', 'Right']
 *   three_finger_swipe_left / right → ['Alt', 'Tab']（任务切换）
 *   three_finger_swipe_up   → ['Win', 'D']（回桌面）
 *
 * ⚠️ 关于 Alt+Tab：
 *   Windows 下 Alt+Tab 会唤起任务切换器，按住 Alt 连续按 Tab 才切换不同窗口；
 *   这里简化为「触发一次 Alt+Tab」（即打开切换器/切到上一个窗口）。
 *   完整的任务切换交互（按住 Alt + 多次 Tab + 松开 Alt）需在 Windows 端单独实现，
 *   当前版本先用单次触发满足 P0，后续迭代再增强。
 *
 * ⚠️ 关于双指左右滑与 PRD 9.5 的方向约定：
 *   PRD 9.5 文字描述（"从左往右滑→后退"）与本控制器的「事件名→按键」映射
 *   存在反向解读空间。这里严格按【任务说明】实现（swipe_left→Alt+Left）。
 *   若实机手感与预期相反，只需对调下方两个映射即可，无需改其他代码。
 */

const { EventType, GestureType } = require('../../shared/protocol')

// 模块级状态
let adapter = null
let settings = null

/**
 * 手势名 → 快捷键组合（人类名）
 * 用函数封装以便对调方向时只改一处
 */
function gestureToKeys(gesture) {
  switch (gesture) {
    case GestureType.TWO_FINGER_SWIPE_LEFT:
      return ['Alt', 'Left']
    case GestureType.TWO_FINGER_SWIPE_RIGHT:
      return ['Alt', 'Right']
    case GestureType.THREE_FINGER_SWIPE_LEFT:
    case GestureType.THREE_FINGER_SWIPE_RIGHT:
      // 任务切换（简化为单次 Alt+Tab）
      return ['Alt', 'Tab']
    case GestureType.THREE_FINGER_SWIPE_UP:
      // 回桌面
      return ['Win', 'D']
    default:
      return null
  }
}

/** 判断手势属于双指还是三指 */
function isThreeFinger(gesture) {
  return (
    gesture === GestureType.THREE_FINGER_SWIPE_LEFT ||
    gesture === GestureType.THREE_FINGER_SWIPE_RIGHT ||
    gesture === GestureType.THREE_FINGER_SWIPE_UP
  )
}

/**
 * 安全执行（兼容同步/异步）
 */
function safeRun(p, context) {
  if (p && typeof p.then === 'function') {
    p.catch((err) => {
      console.error(`[shortcut-controller] ${context} 执行失败:`, err && err.message ? err.message : err)
    })
  }
}

/**
 * 初始化快捷键控制器
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
 * 处理快捷键事件
 * @param {string} type 事件类型（EventType.SHORTCUT）
 * @param {object} payload 事件载荷 { keys: string[] }
 */
function handleShortcut(type, payload = {}) {
  if (!adapter) {
    console.warn('[shortcut-controller] adapter 未初始化，忽略事件:', type)
    return
  }
  try {
    if (type !== EventType.SHORTCUT) {
      console.warn(`[shortcut-controller] 非快捷键事件交给 handleShortcut: ${type}`)
      return
    }
    const keys = payload.keys
    if (!Array.isArray(keys) || keys.length === 0) {
      console.warn('[shortcut-controller] shortcut 事件缺少 keys 数组，已忽略')
      return
    }
    safeRun(adapter.pressShortcut(keys), 'shortcut')
  } catch (err) {
    console.error(`[shortcut-controller] 处理 ${type} 时异常:`, err && err.message ? err.message : err)
  }
}

/**
 * 处理手势事件（把手势翻译成快捷键后执行）
 * @param {string} type 事件类型（EventType.GESTURE）
 * @param {object} payload 事件载荷 { gesture: string }
 */
function handleGesture(type, payload = {}) {
  if (!adapter) {
    console.warn('[shortcut-controller] adapter 未初始化，忽略事件:', type)
    return
  }
  try {
    if (type !== EventType.GESTURE) {
      console.warn(`[shortcut-controller] 非手势事件交给 handleGesture: ${type}`)
      return
    }
    const gesture = payload.gesture
    if (!gesture) {
      console.warn('[shortcut-controller] gesture 事件缺少 gesture 字段')
      return
    }

    // 手势总开关检查（三指/双指分别判断）
    const threeFinger = isThreeFinger(gesture)
    if (threeFinger && settings && settings.enableThreeFingerGesture === false) {
      return
    }
    if (!threeFinger && settings && settings.enableTwoFingerGesture === false) {
      return
    }

    const keys = gestureToKeys(gesture)
    if (!keys) {
      console.warn(`[shortcut-controller] 未知手势，无法映射: "${gesture}"`)
      return
    }
    safeRun(adapter.pressShortcut(keys), `gesture(${gesture})`)
  } catch (err) {
    console.error(`[shortcut-controller] 处理手势 ${type} 时异常:`, err && err.message ? err.message : err)
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
  handleShortcut,
  handleGesture,
  dispose
}
