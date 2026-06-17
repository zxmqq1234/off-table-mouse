/**
 * Electron 主进程入口
 *
 * 职责（板块C：主进程集成）：
 *  1. 创建桌面窗口，加载电脑端 GUI
 *  2. 启动后端服务层（server）：HTTP + WebSocket + 二维码 + 连接管理
 *  3. 初始化控制层（control）：鼠标/键盘/快捷键输入模拟
 *  4. 把 server 的 EventEmitter 事件通过 IPC 转发给渲染进程（桌面端 GUI）
 *  5. 接收渲染进程的 IPC 指令（允许/拒绝连接、刷新二维码、断开、复制地址）
 *  6. 把手机控制事件转发给 control.dispatchEvent 执行（不发给渲染进程）
 *  7. 退出时清理资源（停止服务、销毁控制器）
 *
 * 开发模式：加载 Vite dev server（http://localhost:5173），支持热重载
 * 生产模式：加载构建产物 dist-desktop/index.html
 *
 * IPC 通道命名统一用 `otm:xxx` 前缀，与 preload.js、App.vue 对应：
 *   主进程 -> 渲染进程（send）：otm:status / otm:qrcode / otm:connect_request /
 *                                    otm:disconnect / otm:error
 *   渲染进程 -> 主进程（on）：    otm:approve / otm:reject / otm:refresh-qrcode /
 *                                    otm:disconnect / otm:copy-url
 */

const { app, BrowserWindow, ipcMain, clipboard } = require('electron')
const path = require('path')

const server = require('../server')
const control = require('../control')
const { DEFAULT_SETTINGS } = require('../../shared/constants')

const isDev = process.env.NODE_ENV === 'development'

/** 主窗口引用，避免被 GC 回收 */
let mainWindow = null
/** 当前设置项（后续接入设置模块后可动态更新并下发控制层） */
let settings = DEFAULT_SETTINGS
/** 服务是否在运行（用于退出时避免重复清理） */
let servicesRunning = false

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

  // 页面加载完成后推送一次最新状态/二维码，解决“服务先于窗口就绪”的时序问题
  mainWindow.webContents.on('did-finish-load', pushInitialState)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * 安全地向渲染进程发送 IPC 消息（窗口未就绪/已销毁时自动跳过）
 * @param {string} channel IPC 通道名
 * @param {*} data 负载
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, data)
  }
}

/**
 * 推送一次当前最新状态与二维码给渲染进程
 * 在窗口 did-finish-load 后、或服务启动完成时调用，确保 GUI 拿到初始数据
 */
function pushInitialState() {
  // 当前连接状态（state: idle/waiting/connected/disconnected）
  sendToRenderer('otm:status', {
    state: server.getState(),
    device: server.getDeviceInfo()
  })
  // 当前二维码与连接地址
  const info = server.getInfo()
  if (info) {
    sendToRenderer('otm:qrcode', {
      token: info.token,
      url: info.url,
      qrCodeDataURL: info.qrCodeDataURL
    })
  }
}

/**
 * 订阅 server 事件总线，转发到渲染进程或控制层
 */
function bindServerEvents() {
  // 连接状态变化 → GUI 状态徽章
  server.on('status', data => sendToRenderer('otm:status', data))
  // 新二维码生成（刷新时） → GUI 二维码图
  server.on('qrcode', data => sendToRenderer('otm:qrcode', data))
  // 手机连接请求 → GUI 弹窗确认（携带 { token, device }）
  server.on('connect_request', clientInfo => sendToRenderer('otm:connect_request', clientInfo))
  // 连接断开 → GUI 提示
  server.on('disconnect', data => sendToRenderer('otm:disconnect', data))
  // 服务异常 → GUI 错误提示
  server.on('error', err => {
    sendToRenderer('otm:error', { message: err && err.message ? err.message : String(err) })
  })
  // 控制事件 → 转发控制层执行（不发给渲染进程）
  server.on('control', message => {
    try {
      control.dispatchEvent(message, settings)
    } catch (err) {
      console.error('[main] 控制事件执行失败:', err)
    }
  })
}

/**
 * 注册来自渲染进程的 IPC 监听
 */
function bindIpcHandlers() {
  // 允许手机连接（弹窗点击“允许”）
  ipcMain.on('otm:approve', () => server.approveConnect())
  // 拒绝手机连接（弹窗点击“拒绝”）
  ipcMain.on('otm:reject', () => server.rejectConnect())
  // 刷新二维码（旧 Token 立即失效）
  ipcMain.on('otm:refresh-qrcode', async () => {
    try {
      await server.refreshQRCode()
    } catch (err) {
      sendToRenderer('otm:error', { message: '刷新二维码失败：' + err.message })
    }
  })
  // 主动断开已连接的手机
  ipcMain.on('otm:disconnect', () => server.disconnectClient('user_disconnect'))
  // 复制连接地址到系统剪贴板
  ipcMain.on('otm:copy-url', (_event, url) => {
    if (typeof url === 'string' && url) {
      clipboard.writeText(url)
    }
  })
}

/**
 * 启动应用：创建窗口 → 初始化控制层 → 绑定事件/IPC → 启动服务
 */
async function startApp() {
  // 1. 创建窗口
  createWindow()

  // 2. 初始化控制层（鼠标/键盘/快捷键适配器）
  control.initController(settings)

  // 3. 先绑定事件与 IPC，避免漏发服务启动期间的早期事件
  bindServerEvents()
  bindIpcHandlers()

  // 4. 启动后端服务（HTTP + WebSocket + 二维码 + 连接管理）
  try {
    const info = await server.startServices()
    servicesRunning = true
    console.log(`[main] 服务已启动：${info.url}`)
    // 服务就绪后推送初始二维码/地址（若窗口已加载完成会立即收到）
    pushInitialState()
  } catch (err) {
    // 启动失败（如获取 IP 失败、端口占用）：通知 GUI 显示错误，不让主进程崩溃
    console.error('[main] 服务启动失败:', err)
    sendToRenderer('otm:error', {
      message: '服务启动失败：' + (err && err.message ? err.message : String(err))
    })
  }
}

// Electron 就绪后启动应用
app.whenReady().then(() => {
  startApp().catch(err => console.error('[main] 启动异常:', err))

  // macOS 下点击 dock 图标且无窗口时重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 应用退出前清理资源：停止服务 + 销毁控制器
app.on('before-quit', async event => {
  if (!servicesRunning) return
  // 阻止立即退出，等异步清理完成后再 exit
  event.preventDefault()
  servicesRunning = false
  try {
    await server.stopServices()
  } catch (err) {
    console.error('[main] 停止服务异常:', err)
  }
  try {
    control.disposeController()
  } catch (err) {
    console.error('[main] 销毁控制器异常:', err)
  }
  app.exit(0)
})
