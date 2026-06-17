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
  const { mouse, keyboard, Button, Key, clipboard } = nut

  let sensitivity = 1.0

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

  // moveMouse 串行化锁：高频调用时（边缘持续移动 60fps），避免多个 getPosition+setPosition
  // 并发导致位移丢失（A/B 同时读到旧坐标，都 setPosition 到各自目标，实际只移动一次）。
  // 用 Promise 链把所有 moveMouse 排成队列，前一个完成才执行下一个。
  let moveQueue = Promise.resolve()

  /**
   * 鼠标相对移动（串行化）。
   * 实现：取当前坐标 + dx/dy×灵敏度，setPosition 到目标点。
   * 通过 moveQueue 队列确保每次 getPosition 都读到上一次 setPosition 的结果，
   * 避免高频并发时位移丢失（尤其影响持续向同一方向移动的边缘场景）。
   * 【需 Windows 验证：性能、灵敏度手感】
   */
  function moveMouse(dx, dy) {
    moveQueue = moveQueue.then(async () => {
      const pos = await mouse.getPosition()
      const target = new nut.Point(
        pos.x + Number(dx) * sensitivity,
        pos.y + Number(dy) * sensitivity
      )
      await mouse.setPosition(target)
    }).catch((e) => {
      // 单次失败不阻断后续队列
      console.error('[nutjs-adapter] moveMouse 异常:', e && e.message ? e.message : e)
    })
    return moveQueue
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
    await mouse.pressButton(mapButton(button))
  }

  /** 鼠标松开（拖拽结束） */
  async function pressMouseUp(button) {
    await mouse.releaseButton(mapButton(button))
  }

  /**
   * 滚动。
   * 约定：deltaY < 0 → 向上滚（滚轮向上，内容上移），deltaY > 0 → 向下滚；
   *       deltaX < 0 → 向左，deltaX > 0 → 向右。
   * nut.js 的 scrollUp/scrollDown 入参为「滚动格数」，需把像素级 delta 折算为格数
   * （按 40px≈1 格折算，配合前端 SCROLL_BASE 与 controller 灵敏度，实测手感适中）。
   * 【需 Windows 验证：滚动量级与方向手感】
   */
  async function scrollMouse(deltaX, deltaY) {
    const STEP = 40 // 滚轮格折算（值越小滚动越灵敏）
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
   * 输入文本。
   * - 纯 ASCII（英文/数字/符号）：keyboard.type 逐字符模拟，精确可靠。
   * - 非 ASCII（中文/emoji 等）：nut.js 模拟按键无法输入 IME 字符，
   *   改用剪贴板写入 + Ctrl+V 粘贴，保证内容正确。
   * 【需 Windows 验证：中文粘贴时序、剪贴板污染】
   */
  async function typeText(text) {
    const str = String(text ?? '')
    if (!str) return
    // 检测是否纯 ASCII（用 charCodeAt 避免控制字符正则）
    let ascii = true
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) { ascii = false; break }
    }
    if (ascii) {
      // 纯 ASCII：逐字符模拟按键
      await keyboard.type(str)
      return
    }
    // 非 ASCII：剪贴板 + Ctrl+V 粘贴（覆盖系统剪贴板，可接受）
    await clipboard.setContent(str)
    await keyboard.pressKey(Key.LeftControl, Key.V)
    await keyboard.releaseKey(Key.V, Key.LeftControl)
  }

  /**
   * 敲击单键（功能键，如 Enter/Esc/Backspace/Delete/Tab）。
   * nut.js 没有 press，用 pressKey + releaseKey 模拟一次敲击。
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
    await keyboard.pressKey(keyEnum)
    await keyboard.releaseKey(keyEnum)
  }

  /**
   * 组合键（如 ['Ctrl','C']）。
   * nut.js 没有 press/hotKey，用 pressKey 按顺序按下、releaseKey 反序释放，
   * 模拟标准组合键（修饰键先按住，普通键后点，松开反序）。
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
    // 按顺序按下所有键
    for (const k of keyEnums) {
      await keyboard.pressKey(k)
    }
    // 反序释放所有键
    for (let i = keyEnums.length - 1; i >= 0; i--) {
      await keyboard.releaseKey(keyEnums[i])
    }
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
