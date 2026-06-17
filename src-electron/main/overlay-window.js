/**
 * overlay 动效窗口管理（多显示器感知）
 *
 * 每个显示器创建一个独立 overlay 窗口，避免不同 DPI 缩放下的坐标偏移。
 * 单窗口跨多显示器时 CSS 坐标随显示器 DPI 缩放偏移，效果位置不准。
 *
 * 方案：
 *  1. screen.getAllDisplays() 遍历，每个逻辑显示器建一个透明置顶穿透窗口
 *  2. 鼠标位置 → getDisplayNearestPoint 找到所属显示器 → 对应窗口 render
 *
 * API 与单窗口版本一致：createOverlay / triggerEffect / destroyOverlay
 */
const { BrowserWindow, screen } = require('electron')
const path = require('path')

/** @type {Map<number, {win:BrowserWindow, ox:number, oy:number, ready:boolean}>} */
const overlays = new Map()
// 全量就绪（所有窗口都已就绪）
let allReady = false
const pendingEffects = []

/**
 * 为每个显示器创建一个 overlay 窗口
 */
function createOverlay() {
  // 已创建过且窗口未销毁 → 跳过
  if (overlays.size > 0) {
    const first = overlays.values().next().value
    if (first && first.win && !first.win.isDestroyed()) return
  }

  const displays = screen.getAllDisplays()
  if (displays.length === 0) {
    displays.push(screen.getPrimaryDisplay())
  }

  let readyCount = 0
  const total = displays.length

  for (const display of displays) {
    const { bounds, id } = display
    const win = new BrowserWindow({
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

    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(true)
    win.loadFile(path.join(__dirname, 'overlay.html'))

    win.webContents.on('console-message', (_e, level, message) => {
      const tag = level === 2 ? 'warn' : level === 3 ? 'error' : 'info'
      console.log(`[overlay:${tag}:${id}] ${message}`)
    })

    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        const entry = overlays.get(id)
        if (entry) {
          entry.ready = true
          readyCount++
          console.log(`[overlay] 显示器 ${id} 已就绪 (${readyCount}/${total})`)
          if (readyCount >= total && !allReady) {
            allReady = true
            console.log('[overlay] 所有显示器就绪')
            while (pendingEffects.length > 0) {
              const { effect, text } = pendingEffects.shift()
              _sendEffect(effect, text)
            }
          }
        }
      }, 500)
    })

    win.on('closed', () => {
      overlays.delete(id)
      allReady = false
    })

    overlays.set(id, { win, ox: bounds.x, oy: bounds.y, ready: false })
    console.log(`[overlay] 显示器 ${id} 创建: (${bounds.x},${bounds.y}) ${bounds.width}x${bounds.height}`)
  }

  // 兜底：3 秒后强制标记全量就绪（防止个别窗口没触发 did-finish-load）
  setTimeout(() => {
    if (!allReady) {
      allReady = true
      console.log('[overlay] 兜底: 强制标记所有显示器就绪')
      while (pendingEffects.length > 0) {
        const { effect, text } = pendingEffects.shift()
        _sendEffect(effect, text)
      }
    }
  }, 3000)
}

/**
 * 向光标所在显示器发送动效
 */
function _sendEffect(effect, text) {
  if (overlays.size === 0) return

  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const entry = overlays.get(display.id)
  if (!entry || !entry.ready) {
    // 光标所在显示器还没就绪，尝试任意就绪的窗口
    for (const e of overlays.values()) {
      if (e.ready) {
        _renderOnWindow(e, point, effect, text)
        return
      }
    }
    return
  }
  _renderOnWindow(entry, point, effect, text)
}

/**
 * 在指定 overlay 窗口渲染动效
 */
function _renderOnWindow(entry, point, effect, text) {
  const x = point.x - entry.ox
  const y = point.y - entry.oy
  const js = `window.playEffect(${JSON.stringify({ x, y, effect, text })})`
  entry.win.webContents.executeJavaScript(js).catch(() => {})
}

/**
 * 在当前鼠标位置触发动效
 * @param {string} effect 'touch' | 'gesture'
 * @param {string} [text]
 */
function triggerEffect(effect, text) {
  if (!allReady) {
    if (pendingEffects.length < 20) pendingEffects.push({ effect, text })
    return
  }
  _sendEffect(effect, text)
}

/**
 * 销毁所有 overlay 窗口
 */
function destroyOverlay() {
  for (const [, entry] of overlays) {
    try { entry.win.destroy() } catch (_e) { /* 忽略 */ }
  }
  overlays.clear()
  allReady = false
  pendingEffects.length = 0
}

module.exports = {
  createOverlay,
  triggerEffect,
  destroyOverlay
}
