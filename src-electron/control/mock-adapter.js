/**
 * Mock 输入适配器（Linux 可跑，用于验证事件分发与计算逻辑）
 *
 * 职责：完整实现 adapter.js 定义的接口契约，但【不真正操作系统】，
 *      每个操作只打印日志，便于在 Linux 上观察事件流与数值计算是否正确。
 *
 * 特点：
 * - 纯逻辑、零依赖、可独立运行。
 * - 鼠标移动会按灵敏度倍率缩放 dx/dy（这是 adapter 层的职责）。
 * - 灵敏度档位语义与 nutjs-adapter 一致（low=0.6 / medium=1.0 / high=1.6）。
 */

const { normalizeSensitivity } = require('./adapter')

/**
 * 创建一个 Mock 输入适配器实例
 * @returns {import('./adapter').InputAdapter}
 */
function createMockAdapter() {
  // 当前鼠标灵敏度倍率（数值，内部状态）
  let sensitivity = 1.0

  /** 鼠标相对移动：在 adapter 内应用灵敏度倍率 */
  function moveMouse(dx, dy) {
    const fx = Number(dx) * sensitivity
    const fy = Number(dy) * sensitivity
    console.log(
      `[MOCK] moveMouse fx=${fx.toFixed(2)} fy=${fy.toFixed(2)} ` +
        `(raw dx=${dx} dy=${dy}, sens=${sensitivity}×)`
    )
  }

  /** 鼠标点击：clicks=2 表示双击 */
  function clickMouse(button, clicks = 1) {
    const action = clicks >= 2 ? 'doubleClick' : 'click'
    console.log(`[MOCK] clickMouse button=${button} clicks=${clicks} (${action})`)
  }

  /** 鼠标按下（用于拖拽起始） */
  function pressMouseDown(button) {
    console.log(`[MOCK] pressMouseDown button=${button}`)
  }

  /** 鼠标松开（用于拖拽结束） */
  function pressMouseUp(button) {
    console.log(`[MOCK] pressMouseUp button=${button}`)
  }

  /** 滚动：deltaX/deltaY 已由 controller 应用滚动灵敏度 */
  function scrollMouse(deltaX, deltaY) {
    console.log(
      `[MOCK] scrollMouse deltaX=${deltaX} deltaY=${deltaY} ` +
        `(vertical=${deltaY < 0 ? 'up' : deltaY > 0 ? 'down' : '-'}, ` +
        `horizontal=${deltaX < 0 ? 'left' : deltaX > 0 ? 'right' : '-'})`
    )
  }

  /** 输入文本（逐字符） */
  function typeText(text) {
    const str = String(text ?? '')
    console.log(`[MOCK] typeText "${str}" (len=${str.length})`)
  }

  /** 敲击单键 */
  function tapKey(keyName) {
    console.log(`[MOCK] tapKey key="${keyName}"`)
  }

  /** 组合键 */
  function pressShortcut(keys) {
    console.log(`[MOCK] pressShortcut keys=[${(keys || []).join(', ')}]`)
  }

  /** 设置鼠标灵敏度 */
  function setMouseSensitivity(value) {
    sensitivity = normalizeSensitivity(value)
    console.log(`[MOCK] setMouseSensitivity → ${sensitivity}`)
  }

  /** 读取鼠标灵敏度 */
  function getMouseSensitivity() {
    return sensitivity
  }

  return {
    moveMouse,
    clickMouse,
    pressMouseDown,
    pressMouseUp,
    scrollMouse,
    typeText,
    tapKey,
    pressShortcut,
    setMouseSensitivity,
    getMouseSensitivity
  }
}

module.exports = {
  createMockAdapter
}
