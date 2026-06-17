/**
 * overlay 动效窗口管理
 *
 * 职责：
 *  1. 创建一个透明、置顶、鼠标穿透的覆盖窗口（覆盖所有显示器合集区域）
 *  2. 提供 triggerEffect(x, y, effect, text) 触发鼠标位置的动效（涟漪/手势气泡）
 *
 * 技术要点：
 *  - transparent + frame:false + alwaysOnTop:screen-saver → 透明无框最高置顶
 *  - setIgnoreMouseEvents(true) → 鼠标穿透，不拦截任何操作
 *  - focusable:false → 不抢焦点，不影响当前活动窗口
 *  - 覆盖所有显示器合集 bounds，使多显示器环境下鼠标在任何屏幕都能显示动效
 *  - DOM 坐标需减去窗口左上角偏移（getCursorScreenPoint 是绝对屏幕坐标）
 *
 * dev/prod 都用 file:// 加载 overlay.html（纯 HTML+CSS+JS，不依赖 Vite 构建）
 */
const { BrowserWindow, screen } = require('electron')
const path = require('path')

let overlayWindow = null
// overlay 窗口左上角绝对屏幕坐标（用于把 getCursorScreenPoint 转为窗口内 DOM 坐标）
let overlayOriginX = 0
let overlayOriginY = 0

/**
 * 计算所有显示器的合集边界（包含所有显示器的最小矩形）
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function computeUnionBounds() {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) {
    // 兜底：主显示器
    return screen.getPrimaryDisplay().bounds
  }
  let minX = Infinity, minY = Infinity, maxRight = -Infinity, maxBottom = -Infinity
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxRight = Math.max(maxRight, d.bounds.x + d.bounds.width)
    maxBottom = Math.max(maxBottom, d.bounds.y + d.bounds.height)
  }
  return {
    x: minX,
    y: minY,
    width: maxRight - minX,
    height: maxBottom - minY
  }
}

/**
 * 创建 overlay 窗口（仅创建一次）
 */
function createOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return

  const bounds = computeUnionBounds()
  overlayOriginX = bounds.x
  overlayOriginY = bounds.y

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    show: false, // 先隐藏，内容就绪后再显示
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'overlay-preload.js')
    }
  })

  // 最高置顶级别（覆盖在所有窗口之上，包括全屏应用）
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  // 鼠标穿透：所有鼠标事件透传到下层窗口
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })

  // 加载 overlay 页面（纯 HTML，dev/prod 都用 file://）
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))

  // 内容就绪后显示窗口（避免白屏闪烁）
  overlayWindow.once('ready-to-show', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.show()
    }
  })

  // 窗口意外关闭时不销毁引用清理（避免下次 trigger 报错）
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

/**
 * 在当前鼠标位置触发动效
 * @param {string} effect 'touch'（涟漪）| 'gesture'（手势气泡）
 * @param {string} [text] 手势文字（effect='gesture' 时有效）
 */
function triggerEffect(effect, text) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  // 获取鼠标绝对屏幕坐标
  const point = screen.getCursorScreenPoint()
  // 转为 overlay 窗口内 DOM 坐标（减去窗口左上角偏移）
  const x = point.x - overlayOriginX
  const y = point.y - overlayOriginY

  overlayWindow.webContents.send('otm:overlay-effect', { x, y, effect, text })
}

/**
 * 销毁 overlay 窗口（应用退出时调用）
 */
function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try { overlayWindow.destroy() } catch (_e) { /* 忽略 */ }
  }
  overlayWindow = null
}

module.exports = {
  createOverlay,
  triggerEffect,
  destroyOverlay
}
