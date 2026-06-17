/**
 * 按键名映射表
 *
 * 职责：将协议/界面里使用的「人类可读按键名」（如 'Enter'/'Esc'/'Ctrl'/'C'）
 * 映射到 nut.js Key 枚举的「成员名字符串」（如 'Escape'/'LeftControl'/'C'）。
 *
 * 设计说明：
 * - 本文件【不直接 require nut.js】（nut.js 是 native 模块，Linux 装不上）。
 * - 只负责把按键名翻译成 nut.js Key 枚举的成员名（字符串）。
 * - 真正的枚举值解析（Key[成员名]）放在 nutjs-adapter.js 里运行时完成。
 * - 这样本模块纯逻辑，可在 Linux 下被 mock 路径和单元测试直接使用。
 *
 * 注意：nut.js 不同版本 Key 枚举成员名可能略有差异，
 *       数字键(Num0..Num9)、Win 键(LeftSuper)等需在 Windows 上实测确认。
 */

// 字母键 A-Z：协议里按键名即字母本身，nut.js 枚举成员名也是 'A'..'Z'
const LETTERS = {}
for (let i = 0; i < 26; i++) {
  const ch = String.fromCharCode(65 + i) // 'A'..'Z'
  LETTERS[ch] = ch
}

// 数字键 0-9（顶部数字行）：nut.js 中对应成员名 Num0..Num9（需 Windows 验证）
const DIGITS = {}
for (let i = 0; i < 10; i++) {
  DIGITS[String(i)] = 'Num' + i
}

// 功能键 F1-F12
const F_KEYS = {}
for (let i = 1; i <= 12; i++) {
  F_KEYS['F' + i] = 'F' + i
}

// 特殊键、编辑键、方向键、修饰键的人类名 → nut.js 枚举成员名
const SPECIAL = {
  // 编辑/控制键
  Enter: 'Enter',
  Return: 'Enter',
  Esc: 'Escape',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Del: 'Delete',
  Tab: 'Tab',
  Space: 'Space',
  CapsLock: 'CapsLock',
  // 导航键
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PgUp: 'PageUp',
  PageDown: 'PageDown',
  PgDn: 'PageDown',
  // 方向键
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  // 修饰键（默认用左侧，避免与右侧组合冲突）
  Ctrl: 'LeftControl',
  Control: 'LeftControl',
  Alt: 'LeftAlt',
  Option: 'LeftAlt',
  Shift: 'LeftShift',
  Win: 'LeftSuper',
  Super: 'LeftSuper',
  Meta: 'LeftSuper',
  Cmd: 'LeftSuper'
}

// 合并成总映射表
const KEY_MAP = Object.assign({}, LETTERS, DIGITS, F_KEYS, SPECIAL)

/**
 * 将单个按键名映射为 nut.js Key 枚举成员名
 * @param {string} name 按键名，如 'Enter' / 'Ctrl' / 'C' / '0'
 * @returns {string|undefined} nut.js 枚举成员名（如 'Escape'/'LeftControl'/'C'），找不到返回 undefined
 */
function mapKey(name) {
  if (typeof name !== 'string') {
    console.warn(`[keymap] 非字符串按键名被忽略: ${String(name)}`)
    return undefined
  }
  const trimmed = name.trim()
  if (trimmed === '') return undefined
  // 精确匹配
  if (KEY_MAP[trimmed]) return KEY_MAP[trimmed]
  // 兼容小写：如 'ctrl' → 'Ctrl'，'enter' → 'Enter'
  const upperFirst = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
  if (KEY_MAP[upperFirst]) return KEY_MAP[upperFirst]
  // 单字符字母/数字兜底
  if (/^[a-zA-Z]$/.test(trimmed)) return trimmed.toUpperCase()
  if (/^[0-9]$/.test(trimmed)) return 'Num' + trimmed
  // 仍找不到
  console.warn(`[keymap] 未知按键名，无法映射: "${name}"（建议在 KEY_MAP 中补充）`)
  return undefined
}

/**
 * 批量映射按键名
 * @param {string[]} names 按键名数组，如 ['Ctrl', 'C']
 * @returns {string[]} nut.js 枚举成员名数组（跳过无法映射的项并打警告）
 */
function mapKeys(names) {
  if (!Array.isArray(names)) {
    console.warn(`[keymap] mapKeys 入参非数组: ${String(names)}`)
    return []
  }
  const result = []
  for (const n of names) {
    const mapped = mapKey(n)
    if (mapped) result.push(mapped)
  }
  return result
}

module.exports = {
  KEY_MAP,
  mapKey,
  mapKeys
}
