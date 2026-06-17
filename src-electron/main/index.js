/**
 * Electron 主进程入口
 *
 * 职责：创建桌面窗口，加载电脑端 GUI。
 * - 开发模式：加载 Vite dev server（http://localhost:5173），支持热重载
 * - 生产模式：加载构建产物 dist-desktop/index.html
 *
 * 后续在此集成：本地 HTTP 服务、WebSocket 服务、二维码、连接管理、鼠标/键盘模拟等模块。
 */

const { app, BrowserWindow } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

/** 主窗口引用，避免被 GC 回收 */
let mainWindow = null

/**
 * 创建主窗口并加载 GUI
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 400,
    minHeight: 600,
    title: '桌外鼠标',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    // 开发模式：加载 Vite dev server，自动打开开发者工具便于调试
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 生产模式：加载本地构建产物
    mainWindow.loadFile(path.join(__dirname, '../../dist-desktop/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Electron 就绪后创建窗口
app.whenReady().then(() => {
  createWindow()

  // macOS 下点击 dock 图标且无窗口时重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
