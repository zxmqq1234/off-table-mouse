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
 *  - 动效触发改用 webContents.executeJavaScript 直接调用 window.playEffect，
 *    绕过 IPC + contextBridge 链路（此前 webContents.send 存在接收不可靠问题）
 *
 * dev/prod 都用 file:// 加载 overlay.html（纯 HTML+CSS+JS，不依赖 Vite 构建）
 */
const { BrowserWindow, screen } = require('electron')
const path = require('path')

let overlayWindow = null
// overlay 窗口左上角绝对屏幕坐标（用于把 getCursorScreenPoint 转为窗口内 DOM 坐标）
let overlayOriginX = 0
let overlayOriginY = 0
// overlay 页面是否已就绪（did-finish-load + 500ms 缓冲后设为 true）
let overlayReady = false
// 缓冲就绪前触发的动效（页面就绪后补发）
const pendingEffects = []

/**
 * 计算所有显示器的合集边界（包含所有显示器的最小矩形）
 * @returns {{x:number,y:number,width:number,height:number}}
 */
function computeUnionBounds() {
  const displays = screen.getAllDisplays()
  if (displays.length === 0) {
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
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'overlay-preload.js')
    }
  })

  // 最高置顶级别
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  // 鼠标穿透
  overlayWindow.setIgnoreMouseEvents(true)

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))

  overlayWindow.once('ready-to-show', () => {
    console.log('[overlay] ready-to-show')
  })

  overlayWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[overlay] 页面加载失败:', code, desc)
  })

  // 把 overlay 页面的 console.log 转发到主进程终端
  overlayWindow.webContents.on('console-message', (_event, level, message, _line, _sourceId) => {
    const tag = level === 2 ? 'warn' : level === 3 ? 'error' : 'info'
    console.log(`[overlay:${tag}] ${message}`)
  })

  // 页面加载完成 + 500ms 缓冲后标记就绪（页面自检脚本在 2s 后触发，足够）
  overlayWindow.webContents.on('did-finish-load', () => {
    console.log('[overlay] 页面已加载')
    setTimeout(() => {
      overlayReady = true
      console.log('[overlay] 页面已就绪')
      while (pendingEffects.length > 0) {
        const { effect, text } = pendingEffects.shift()
        _sendEffect(effect, text)
      }
    }, 500)
  })

  // 兜底：1.5 秒后强制 show
  setTimeout(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && !overlayWindow.isVisible()) {
      overlayWindow.show()
      console.log('[overlay] 兜底强制 show')
    }
  }, 1500)

  // 窗口意外关闭时清理引用
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
}

/**
 * 实际向 overlay 页面发送动效（直接 executeJavaScript 调用 window.playEffect）
 * @param {string} effect
 * @param {string} [text]
 */
function _sendEffect(effect, text) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    console.log('[diag] _sendEffect: overlay窗口不存在/已销毁')
    return
  }
  const point = screen.getCursorScreenPoint()
  const x = point.x - overlayOriginX
  const y = point.y - overlayOriginY
  const js = `window.playEffect(${JSON.stringify({ x, y, effect, text })})`
  console.log('[diag] _sendEffect: executeJS', { x, y, effect, text }, '窗口可见:', overlayWindow.isVisible())
  overlayWindow.webContents.executeJavaScript(js).catch(err => {
    console.error('[overlay] executeJavaScript 失败:', err.message || err)
  })
}

/**
 * 在当前鼠标位置触发动效
 * @param {string} effect 'touch'（涟漪）| 'gesture'（手势气泡）
 * @param {string} [text] 手势文字（effect='gesture' 时有效）
 */
function triggerEffect(effect, text) {
  console.log('[diag] triggerEffect 调用:', effect, 'overlayReady:', overlayReady)
  if (!overlayReady) {
    console.log('[diag] triggerEffect: 页面未就绪，缓冲')
    if (pendingEffects.length < 20) pendingEffects.push({ effect, text })
    return
  }
  _sendEffect(effect, text)
}

function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try { overlayWindow.destroy() } catch (_e) { /* 忽略 */ }
  }
  overlayWindow = null
  overlayReady = false
  pendingEffects.length = 0
}

module.exports = {
  createOverlay,
  triggerEffect,
  destroyOverlay
}
