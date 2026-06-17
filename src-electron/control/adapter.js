/**
 * 输入模拟适配器 —— 抽象接口与工厂
 *
 * 职责：定义统一的「输入操作接口」（所有具体实现都必须遵循），
 *      并通过工厂函数 createInputAdapter(type) 产出具体实现。
 *
 * 为什么要适配器模式：
 * - 当前开发环境是 Linux，nut.js（系统输入模拟库）是 native 模块，
 *   在 Linux 上无法真实运行（也无 Windows 系统可调用）。
 * - 因此定义抽象接口，配两套实现：
 *     • mock 实现：纯逻辑、可打印日志，用于在 Linux 上验证事件分发与计算逻辑。
 *     • nutjs 实现：调用系统 API 真实执行（仅 Windows 可用，需在 Windows 验证）。
 * - 最终在 Windows 上只需把 adapter 类型从 'mock' 切到 'nutjs' 即可真实运行，
 *   控制器层代码完全不变。
 *
 * ┌──────────────────────────────────────────────────┐
 * │ 接口契约（每个方法的具体行为见 JSDoc）              │
 * ├──────────────────────────────────────────────────┤
 * │ moveMouse(dx, dy)            相对移动鼠标          │
 * │ clickMouse(button, clicks)   点击（含双击）        │
 * │ pressMouseDown(button)       按下鼠标键            │
 * │ pressMouseUp(button)         松开鼠标键            │
 * │ scrollMouse(deltaX, deltaY)  滚动                  │
 * │ typeText(text)               逐字符输入文本        │
 * │ tapKey(keyName)              单键敲击              │
 * │ pressShortcut(keys)          组合键                │
 * │ setMouseSensitivity(value)   设置鼠标灵敏度        │
 * │ getMouseSensitivity()        读取鼠标灵敏度        │
 * └──────────────────────────────────────────────────┘
 *
 * 灵敏度职责约定：
 * - 鼠标移动的【灵敏度倍率】由 adapter 内部应用（在 moveMouse 里缩放 dx/dy），
 *   这样 adapter 是「执行层 + 灵敏度」的完整单位。
 * - 鼠标移动的【加速度】（基于滑动速度）由 mouse-controller 计算，
 *   计算后传入 moveMouse 的 dx/dy 已包含加速度。
 * - 即最终位移 = 原始 dx × 加速度(controller) × 灵敏度(adapter)，互不重复。
 */

/** 旧灵敏度档位 → 数值倍率（向后兼容已保存的旧 settings.json） */
const LEGACY_SENSITIVITY = { low: 0.6, medium: 1.0, high: 1.6 }

/**
 * 将灵敏度值归一化为数值倍率
 * - 旧字符串档位 'low'/'medium'/'high' 自动转换为对应倍率
 * - 数值直接使用，限制在 0.1~3.0 范围
 * @param {string|number} value
 * @returns {number} 数值倍率（如 0.6 / 1.0 / 1.6）
 */
function normalizeSensitivity(value) {
  if (typeof value === 'string' && LEGACY_SENSITIVITY[value] != null) {
    return LEGACY_SENSITIVITY[value]
  }
  const n = Number(value)
  if (!Number.isFinite(n)) return 1.0
  return Math.min(3.0, Math.max(0.1, n))
}

/**
 * 输入适配器抽象接口（JSDoc 契约）。
 * 具体实现需覆盖以下全部方法；均为「可同步可异步」，调用方需兼容 Promise。
 * @typedef {Object} InputAdapter
 * @property {(dx:number, dy:number) => void|Promise<void>} moveMouse 相对移动鼠标（dx/dy 已含加速度，adapter 再乘灵敏度）
 * @property {(button:'left'|'right'|'middle', clicks?:number) => void|Promise<void>} clickMouse 点击；clicks=2 表示双击
 * @property {(button:'left'|'right'|'middle') => void|Promise<void>} pressMouseDown 按下鼠标键
 * @property {(button:'left'|'right'|'middle') => void|Promise<void>} pressMouseUp 松开鼠标键
 * @property {(deltaX:number, deltaY:number) => void|Promise<void>} scrollMouse 滚动（deltaX/Y 已含滚动灵敏度）
 * @property {(text:string) => void|Promise<void>} typeText 输入文本（逐字符）
 * @property {(keyName:string) => void|Promise<void>} tapKey 敲击单键（Enter/Esc/Backspace/Delete/Tab 等）
 * @property {(keys:string[]) => void|Promise<void>} pressShortcut 组合键（人类名数组，如 ['Ctrl','C']）
 * @property {(value:'low'|'medium'|'high'|number) => void} setMouseSensitivity 设置鼠标灵敏度
 * @property {() => 'low'|'medium'|'high'} getMouseSensitivity 读取鼠标灵敏度
 */

/**
 * 适配器工厂：按类型创建输入适配器实现
 * @param {'mock'|'nutjs'} [type='mock'] 适配器类型
 * @returns {InputAdapter}
 */
function createInputAdapter(type = 'mock') {
  if (type === 'nutjs') {
    // nutjs 实现内部会 try/catch require nut.js；失败则自动降级为 mock 并打错误日志
    const { createNutjsAdapter } = require('./nutjs-adapter')
    return createNutjsAdapter()
  }
  // 默认 mock（Linux 开发与逻辑验证用）
  const { createMockAdapter } = require('./mock-adapter')
  return createMockAdapter()
}

module.exports = {
  LEGACY_SENSITIVITY,
  normalizeSensitivity,
  createInputAdapter
}
