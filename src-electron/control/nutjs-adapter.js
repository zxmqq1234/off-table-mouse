/**
 * nut.js 输入适配器（Windows 真实执行）
 *
 * 职责：调用 @nut-tree-fork/nut-js（nut.js 的免费分支，无需 license）
 *      真实地操作系统鼠标与键盘。所有方法的接口签名与 mock-adapter 完全一致。
 *
 * ⚠️ 重要约束（务必先读）：
 * 1. nut.js 是【native 模块】，必须在目标平台（Windows）安装并执行
 *    `electron-rebuild` 重新编译后才能在 Electron 里使用。
 * 2. 当前 Linux 开发环境【无法 npm install @nut-tree-fork/nut-js】（装不上 native 部分），
 *    因此本文件对 nut.js 的 require 全部用 try/catch 包裹；一旦 require 失败，
 *    自动降级为 mock adapter，并打 console.error 提示，保证程序不崩溃、Linux 也能跑。
 * 3. 以下所有 native 调用均标注「需 Windows 验证」，具体表现（坐标、滚动量级、
 *    Alt+Tab 任务切换器等）需在 Windows 真机上实测微调。
 *
 * Windows 集成清单（打包时）：
 * - package.json dependencies 增加 "@nut-tree-fork/nut-js": "^4.x"
 * - 安装后执行 electron-rebuild（参考 @electron/rebuild）
 * - electron-builder 配置中确认 native 模块未被 asar 打包（asarUnpack 或 files 处理）
 * - 切换 adapter 类型：index.js 的 ADAPTER_TYPE 改为 'nutjs'
 *   （或设置环境变量 INPUT_ADAPTER=nutjs）
 */

const { normalizeSensitivity } = require('./adapter')
const { mapKeys } = require('./keymap')

// 尝试加载 nut.js；失败则 native 不可用
let nut = null
let nativeLoadError = null
try {
  // @nut-tree-fork/nut-js 是免费分支，API 与官方 @nut-tree/nut-js 一致
  nut = require('@nut-tree-fork/nut-js')
} catch (err) {
  nativeLoadError = err
}

/**
 * 创建 nut.js 输入适配器。
 * 若 nut.js 加载失败，自动降级为 mock adapter 并打错误日志。
 * @returns {import('./adapter').InputAdapter}
 */
function createNutjsAdapter() {
  // 降级：nut.js 不可用，回退 mock
  if (!nut) {
    console.error(
      '[nutjs-adapter] 加载 @nut-tree-fork/nut-js 失败，降级为 mock adapter。' +
        '（Linux 下属正常；若在 Windows 仍见此提示，请先 npm install 并 electron-rebuild）'
    )
    if (nativeLoadError) {
      console.error('[nutjs-adapter] 原始错误:', nativeLoadError.message)
    }
    const { createMockAdapter } = require('./mock-adapter')
    return createMockAdapter()
  }

  // 取出 nut.js 核心对象（解构前先判空，避免在降级路径上引用 undefined）
  const { mouse, keyboard, Button, Key } = nut

  let sensitivity = 'medium'

  /**
   * 把协议按键名 'left'/'right'/'middle' 映射为 nut.js Button 枚举
   * @param {'left'|'right'|'middle'} button
   * @returns {import('@nut-tree-fork/nut-js').Button}
   */
  function mapButton(button) {
    switch (button) {
      case 'right':
        return Button.RIGHT
      case 'middle':
        return Button.MIDDLE
      case 'left':
      default:
        return Button.LEFT
    }
  }

  /**
   * 鼠标相对移动。
   * 实现：先取当前坐标，再加上 dx/dy（已含加速度）× 灵敏度倍率，set 到目标点。
   * 注：getPosition+setPosition 每帧有少量开销，高频移动性能需在 Windows 实测，
   *     若有瓶颈可改为缓存上次坐标或使用更底层的 robotjs-style delta API。
   * 【需 Windows 验证：性能、灵敏度手感】
   */
  async function moveMouse(dx, dy) {
    const m = (require('./adapter').SENSITIVITY_MULTIPLIER)[sensitivity] ?? 1.0
    const pos = await mouse.getPosition()
    const target = new nut.Point(pos.x + Number(dx) * m, pos.y + Number(dy) * m)
    await mouse.setPosition(target)
  }

  /**
   * 鼠标点击。clicks>=2 → 双击。
   * 【需 Windows 验证：双击时序】
   */
  async function clickMouse(button, clicks = 1) {
    const btn = mapButton(button)
    if (clicks >= 2) {
      await mouse.doubleClick(btn)
    } else {
      await mouse.click(btn)
    }
  }

  /** 鼠标按下（拖拽起始） */
  async function pressMouseDown(button) {
    await mouse.press(mapButton(button))
  }

  /** 鼠标松开（拖拽结束） */
  async function pressMouseUp(button) {
    await mouse.release(mapButton(button))
  }

  /**
   * 滚动。
   * 约定：deltaY < 0 → 向上滚（滚轮向上，内容上移），deltaY > 0 → 向下滚；
   *       deltaX < 0 → 向左，deltaX > 0 → 向右。
   * nut.js 的 scrollUp/scrollDown 入参为「滚动格数」，需把像素级 delta 折算为格数
   * （此处按 120px≈1 格折算，需 Windows 实测微调）。
   * 【需 Windows 验证：滚动量级与方向手感】
   */
  async function scrollMouse(deltaX, deltaY) {
    const STEP = 120 // 1 滚轮格 ≈ 120px，可调
    if (deltaY < 0) {
      await mouse.scrollUp(Math.max(1, Math.round(-deltaY / STEP)))
    } else if (deltaY > 0) {
      await mouse.scrollDown(Math.max(1, Math.round(deltaY / STEP)))
    }
    // 横向滚动（部分 nut.js 版本提供 scrollLeft/scrollRight）
    if (deltaX < 0 && typeof mouse.scrollLeft === 'function') {
      await mouse.scrollLeft(Math.max(1, Math.round(-deltaX / STEP)))
    } else if (deltaX > 0 && typeof mouse.scrollRight === 'function') {
      await mouse.scrollRight(Math.max(1, Math.round(deltaX / STEP)))
    }
  }

  /**
   * 输入文本（逐字符）。
   * nut.js keyboard.type 已支持多字符；中文依赖系统 IME，建议手机端用 compositionend 上屏后整体同步。
   * 【需 Windows 验证：中文/Emoji 输入】
   */
  async function typeText(text) {
    await keyboard.type(String(text ?? ''))
  }

  /**
   * 敲击单键（功能键，如 Enter/Esc/Backspace/Delete/Tab）。
   * 【需 Windows 验证：枚举成员名是否正确】
   */
  async function tapKey(keyName) {
    const memberName = require('./keymap').mapKey(keyName)
    if (!memberName) {
      console.warn(`[nutjs-adapter] tapKey 无法映射按键: "${keyName}"，已忽略`)
      return
    }
    const keyEnum = Key[memberName]
    if (!keyEnum) {
      console.warn(`[nutjs-adapter] Key 枚举中无成员 "${memberName}"（按键 "${keyName}"），已忽略`)
      return
    }
    await keyboard.press(keyEnum)
  }

  /**
   * 组合键（如 ['Ctrl','C']）。
   * nut.js keyboard.press 支持多键同时按下。
   * 【需 Windows 验证：Alt+Tab 任务切换器的特殊性（见 shortcut-controller 注释）】
   */
  async function pressShortcut(keys) {
    const memberNames = mapKeys(keys || [])
    if (memberNames.length === 0) {
      console.warn('[nutjs-adapter] pressShortcut 无有效按键，已忽略')
      return
    }
    const keyEnums = []
    for (const m of memberNames) {
      const k = Key[m]
      if (!k) {
        console.warn(`[nutjs-adapter] Key 枚举中无成员 "${m}"，已跳过该键`)
        continue
      }
      keyEnums.push(k)
    }
    if (keyEnums.length === 0) return
    await keyboard.press(...keyEnums)
  }

  /** 设置鼠标灵敏度 */
  function setMouseSensitivity(value) {
    sensitivity = normalizeSensitivity(value)
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
  createNutjsAdapter,
  /** 暴露加载状态，便于上层诊断（测试用） */
  isNativeAvailable: () => nut !== null,
  getNativeLoadError: () => nativeLoadError
}
