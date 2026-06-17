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
 *                                    otm:disconnect / otm:error / otm:settings
 *   渲染进程 -> 主进程（on）：    otm:approve / otm:reject / otm:refresh-qrcode /
 *                                    otm:disconnect / otm:copy-url /
 *                                    otm:update-settings / otm:reset-settings
 *   渲染进程 -> 主进程（invoke）：otm:get-settings
 */

const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, nativeTheme } = require('electron')
const path = require('path')

const server = require('../server')
const control = require('../control')
const settingsStore = require('../core/settings')
const logger = require('../core/logger')
const overlay = require('./overlay-window')
const { GestureType } = require('../../shared/protocol')

const isDev = process.env.NODE_ENV === 'development'

/** 主窗口引用，避免被 GC 回收 */
let mainWindow = null
/** 当前设置项（从持久化加载，变更时下发控制层与渲染进程） */
let settings = null
/** 服务是否在运行（用于退出时避免重复清理） */
let servicesRunning = false
/** 系统托盘实例（任务6，最小化到托盘） */
let tray = null
/** 是否正在真正退出（区分"最小化到托盘"与"退出应用"） */
let isQuitting = false
/** overlay 是否已创建（防重复，白屏预防兜底用） */
let overlayCreated = false

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
    backgroundColor: '#ffffff', // 显式背景色，避免透明窗口创建顺序导致的白屏
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    // 开发模式：加载 Vite dev server，自动打开开发者工具便于调试
    // 加重试机制：Vite 偶尔未完全就绪时 loadURL 失败，重试避免白屏
    const loadWithRetry = (url, retries = 3) => {
      mainWindow.loadURL(url).catch(() => {
        if (retries > 0) {
          console.log(`[main] 加载 ${url} 失败，${1}s 后重试（剩余 ${retries} 次）`)
          setTimeout(() => loadWithRetry(url, retries - 1), 1000)
        }
      })
    }
    loadWithRetry('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 生产模式：加载本地构建产物
    mainWindow.loadFile(path.join(__dirname, '../../dist-desktop/index.html'))
  }

  // 页面加载完成后推送一次最新状态/二维码，解决“服务先于窗口就绪”的时序问题
  mainWindow.webContents.on('did-finish-load', pushInitialState)

  // 关闭窗口前拦截：根据设置决定"最小化到托盘"或"正常退出"（任务6，PRD P1 #54）
  mainWindow.on('close', event => {
    // 真正退出（托盘菜单"退出" / before-quit）时不拦截
    if (isQuitting) return
    // 读取最新设置：开启最小化到托盘则隐藏窗口而非退出应用
    const current = settingsStore.getSettings()
    if (current && current.minimizeToTray) {
      event.preventDefault()
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
    }
    // minimizeToTray=false 时放行 → 触发 closed → 正常退出流程
  })

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
  // 推送当前设置项，供 GUI 设置面板初始化显示
  sendToRenderer('otm:settings', settingsStore.getSettings())
}

/**
 * 应用主题模式到系统级 nativeTheme（任务3，PRD 7.5 P1 #51）
 * - system：跟随操作系统
 * - light：强制浅色
 * - dark：强制深色
 * nativeTheme 影响系统标题栏/滚动条等原生 UI 颜色；渲染进程 CSS 另做适配
 * @param {string} themeMode 'system' | 'light' | 'dark'
 */
function applyTheme(themeMode) {
  try {
    if (themeMode === 'dark') {
      nativeTheme.themeSource = 'dark'
    } else if (themeMode === 'light') {
      nativeTheme.themeSource = 'light'
    } else {
      // system 或未知值：跟随系统
      nativeTheme.themeSource = 'system'
    }
    logger.log('info', `主题已切换：${themeMode}`)
  } catch (err) {
    // 某些平台/环境（如 headless）nativeTheme 可能异常，降级忽略
    logger.log('warn', '应用主题失败：' + (err && err.message ? err.message : err))
  }
}

/**
 * 显示主窗口（托盘"显示"或单击托盘图标时调用）
 */
function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * 创建系统托盘（任务6，PRD P1 #54）
 * - 图标：build/tray-icon.png（鼠标光标形状，蓝色）
 * - 菜单：显示主窗口 / 免确认连接开关 / 断开连接 / 刷新二维码 / 退出
 * - 单击托盘图标：切换主窗口显示/隐藏
 * 失败时仅记录日志，不阻断应用启动（某些 Linux 环境无托盘支持）
 */
function createTray() {
  try {
    // 加载托盘图标（16x16 适合 Windows 系统托盘尺寸）
    const iconPath = path.join(__dirname, '..', '..', 'build', 'tray-icon-16.png')
    let icon = nativeImage.createFromPath(iconPath)
    // 图标文件缺失或空时降级为空白图标（不影响托盘功能）
    if (icon.isEmpty()) {
      logger.log('warn', '托盘图标文件缺失或为空，使用空白图标占位')
      icon = nativeImage.createEmpty()
    }
    tray = new Tray(icon)
    tray.setToolTip('桌外鼠标')

    // 右键菜单：显示窗口 / 免确认开关 / 断开 / 刷新二维码 / 退出
    const menu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: '免确认连接',
        type: 'checkbox',
        checked: settingsStore.getSettings().autoApproveConnect !== false,
        click: (menuItem) => {
          settingsStore.updateSettings({ autoApproveConnect: menuItem.checked })
        }
      },
      {
        label: '断开连接',
        enabled: server.getState() === 'connected',
        click: () => {
          try { server.disconnectClient('tray_disconnect') } catch (_e) { /* 忽略 */ }
        }
      },
      {
        label: '刷新二维码',
        click: async () => {
          try { await server.refreshQRCode() } catch (_e) { /* 忽略 */ }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)

    // 单击托盘图标：切换窗口显示/隐藏
    tray.on('click', () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide()
      } else {
        showMainWindow()
      }
    })
    logger.log('info', '系统托盘已创建')
  } catch (err) {
    logger.log('warn', '创建托盘失败（可忽略，不影响主功能）：' + (err && err.message ? err.message : err))
    tray = null
  }
}

/**
 * 刷新托盘菜单状态（连接状态变化时调用，更新"断开连接"可用性）
 */
function refreshTrayMenu() {
  if (!tray) return
  try {
    const connected = server.getState() === 'connected'
    const autoApprove = settingsStore.getSettings().autoApproveConnect !== false
    const menu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => showMainWindow()
      },
      { type: 'separator' },
      {
        label: '免确认连接',
        type: 'checkbox',
        checked: autoApprove,
        click: (menuItem) => {
          settingsStore.updateSettings({ autoApproveConnect: menuItem.checked })
        }
      },
      {
        label: '断开连接',
        enabled: connected,
        click: () => {
          try { server.disconnectClient('tray_disconnect') } catch (_e) { /* 忽略 */ }
        }
      },
      {
        label: '刷新二维码',
        click: async () => {
          try { await server.refreshQRCode() } catch (_e) { /* 忽略 */ }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
    tray.setContextMenu(menu)
  } catch (_e) { /* 忽略刷新异常 */ }
}

/**
 * 创建动效 overlay 窗口（异常保护，失败不阻断主功能）
 */
function createOverlayWrapper() {
  overlayCreated = true
  try {
    overlay.createOverlay()
    logger.log('info', '动效 overlay 窗口已创建')
  } catch (err) {
    logger.log('warn', '创建 overlay 窗口失败（不影响主功能）：' + (err && err.message ? err.message : err))
  }
}

/**
 * 根据当前 settings.serverPort 构造 startServices 的端口选项（任务4，PRD 7.5 P1 #52）
 * - 'auto'：用默认端口（传 undefined 让服务层用 DEFAULT_PORT=8765，占用自动递增）
 * - 数字：用指定端口（占用时 http-server 仍会自动递增重试，属容错行为）
 * @returns {{port?: number}}
 */
function buildServiceOptions() {
  const portRaw = settings && settings.serverPort
  if (portRaw === 'auto' || portRaw == null) {
    // 自动：不传具体端口，由 http-server 用 DEFAULT_PORT 起步并递增
    return {}
  }
  const num = Number(portRaw)
  if (Number.isFinite(num) && num > 0 && num < 65536) {
    return { port: num }
  }
  // 非法值降级为自动
  return {}
}

/**
 * 重启服务：先停后启（任务4，端口变更时调用）
 * 端口变更需要重新监听才能生效，这里用 stop+start 实现；全程 try/catch 保护
 */
async function restartServices() {
  logger.log('info', '正在重启服务（端口变更）...')
  try {
    if (servicesRunning) {
      await server.stopServices()
      servicesRunning = false
    }
  } catch (err) {
    logger.log('error', '停止旧服务失败：' + (err && err.message ? err.message : err))
  }
  try {
    const info = await server.startServices(buildServiceOptions())
    servicesRunning = true
    logger.log('info', `服务已重启：${info.url}`)
    // 重启后推送新的二维码/地址给 GUI
    pushInitialState()
  } catch (err) {
    logger.log('error', '重启服务失败：' + (err && err.message ? err.message : err))
    sendToRenderer('otm:error', {
      message: '端口变更后重启服务失败：' + (err && err.message ? err.message : String(err))
    })
  }
}

/**
 * 订阅 server 事件总线，转发到渲染进程或控制层
 */
function bindServerEvents() {
  // 连接状态变化 → GUI 状态徽章 + 关键状态日志（任务2）
  server.on('status', data => {
    sendToRenderer('otm:status', data)
    // 仅记录关键状态，避免 idle/waiting 刷屏
    if (data && data.state === 'connected') {
      const dev = data.device || {}
      logger.log('info', `手机已连接：${dev.deviceName || dev.ip || '未知设备'}`)
    } else if (data && data.state === 'disconnected') {
      logger.log('warn', '连接已断开')
    }
    // 刷新托盘菜单（更新"断开连接"可用性）
    refreshTrayMenu()
  })
  // 新二维码生成（刷新时） → GUI 二维码图
  server.on('qrcode', data => sendToRenderer('otm:qrcode', data))
  // 手机连接请求 → GUI 弹窗确认（携带 { token, device }）+ 日志（任务2）
  server.on('connect_request', clientInfo => {
    sendToRenderer('otm:connect_request', clientInfo)
    const dev = (clientInfo && clientInfo.device) || {}
    logger.log('info', `收到连接请求：${dev.deviceName || dev.ip || '未知设备'}`)
  })
  // 连接断开 → GUI 提示 + 日志（任务2）
  server.on('disconnect', data => {
    sendToRenderer('otm:disconnect', data)
    logger.log('warn', `连接断开：${(data && data.reason) || '未知原因'}`)
  })
  // 服务异常 → GUI 错误提示 + 日志（任务2）
  server.on('error', err => {
    const msg = err && err.message ? err.message : String(err)
    sendToRenderer('otm:error', { message: msg })
    logger.log('error', '服务异常：' + msg)
  })
  // 控制事件 → 转发控制层执行（不发给渲染进程）
  server.on('control', message => {
    // 动效事件：纯 UI 反馈，不进控制层，直接触发 overlay 动效
    if (message && message.type === 'cursor_effect') {
      console.log('[diag] 收到 cursor_effect 事件，触发动效')
      triggerEffectFromMessage(message)
      return
    }
    // 设置同步：手机端下发设置变更，应用并落盘（不进控制层）
    if (message && message.type === 'setting_update') {
      console.log('[diag] 收到 setting_update:', JSON.stringify(message.payload && message.payload.settings))
      try {
        settingsStore.updateSettings((message.payload && message.payload.settings) || {})
      } catch (err) {
        logger.log('warn', '应用手机端设置同步失败：' + (err && err.message ? err.message : err))
      }
      return
    }
    // 手势事件：既执行快捷键，又在 overlay 显示手势文字动效
    if (message && message.type === 'gesture') {
      console.log('[diag] 收到 gesture 事件:', (message.payload && message.payload.gesture))
      triggerEffectFromMessage(message)
    }
    // 滚动事件诊断
    if (message && message.type === 'mouse_scroll') {
      console.log('[diag] mouse_scroll payload:', JSON.stringify(message.payload), '当前灵敏度:', settings && JSON.stringify({ v: settings.verticalScrollSensitivity, h: settings.horizontalScrollSensitivity }))
    }
    try {
      control.dispatchEvent(message, settings)
    } catch (err) {
      console.error('[main] 控制事件执行失败:', err)
      logger.log('error', '控制事件执行失败：' + (err && err.message ? err.message : err))
    }
  })
}

/**
 * 根据消息类型触发动效（在当前鼠标位置显示）
 * - cursor_effect：单指触碰涟漪
 * - gesture：手势文字气泡（根据手势类型映射提示文字）
 * @param {{type:string, payload?:object}} message
 */
function triggerEffectFromMessage(message) {
  const payload = (message && message.payload) || {}
  if (message.type === 'cursor_effect') {
    // 单指触碰 → 涟漪
    console.log('[diag] triggerEffect touch（调用 overlay.triggerEffect）')
    overlay.triggerEffect('touch')
  } else if (message.type === 'gesture' && payload.gesture) {
    // 手势 → 文字气泡（映射手势到可读文字）
    const text = gestureText(payload.gesture)
    console.log('[diag] triggerEffect gesture:', payload.gesture, 'text:', text)
    if (text) overlay.triggerEffect('gesture', text)
  }
}

/**
 * 手势类型 → 可读提示文字（用于动效气泡显示）
 * @param {string} gesture GestureType 枚举值
 * @returns {string|null}
 */
function gestureText(gesture) {
  switch (gesture) {
    case GestureType.TWO_FINGER_SWIPE_LEFT:
      return '前进 →'
    case GestureType.TWO_FINGER_SWIPE_RIGHT:
      return '← 返回'
    case GestureType.THREE_FINGER_SWIPE_LEFT:
    case GestureType.THREE_FINGER_SWIPE_RIGHT:
      return '切换窗口'
    case GestureType.THREE_FINGER_SWIPE_UP:
      return '多任务视图'
    case GestureType.THREE_FINGER_SWIPE_DOWN:
      return '显示桌面'
    case GestureType.THREE_FINGER_TAP:
      return '中键'
    default:
      return null
  }
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

  // —— 设置模块 IPC ——
  // 渲染进程请求当前设置（用 handle 返回值，便于 GUI 初始化）
  ipcMain.handle('otm:get-settings', () => settingsStore.getSettings())
  // 渲染进程提交设置变更（部分更新），settingsStore 内部会落盘并触发 change 事件
  ipcMain.on('otm:update-settings', (_event, patch) => {
    settingsStore.updateSettings(patch)
  })
  // 渲染进程重置为默认设置
  ipcMain.on('otm:reset-settings', () => {
    settingsStore.resetSettings()
  })

  // —— 连接日志 IPC（任务2，PRD P1 #50）——
  // 渲染进程请求最近日志（日志面板打开时拉取历史）
  ipcMain.handle('otm:get-logs', () => logger.getRecent())

  // —— 开机自启动 IPC（任务5，PRD P1 #53）——
  // 查询当前开机自启动状态（系统级设置，不入 settings.json）
  ipcMain.handle('otm:get-autolaunch', () => {
    try {
      return !!app.getLoginItemSettings().openAtLogin
    } catch (err) {
      logger.log('warn', '读取开机自启动状态失败：' + (err && err.message ? err.message : err))
      return false
    }
  })
  // 设置开机自启动开关
  ipcMain.on('otm:set-autolaunch', (_event, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: !!enabled })
      logger.log('info', `开机自启动已${enabled ? '开启' : '关闭'}`)
    } catch (err) {
      logger.log('warn', '设置开机自启动失败：' + (err && err.message ? err.message : err))
    }
  })
}

/**
 * 订阅设置变更：更新主进程持有的 settings 引用，并推送给渲染进程
 * 注意：控制层（control）的设置同步在 dispatchEvent 时按最新 settings 自动应用，
 * 因此这里无需单独调用 control.updateSettings。
 */
function bindSettingsChange() {
  settingsStore.onChange(next => {
    const prev = settings
    settings = next
    sendToRenderer('otm:settings', next)

    // 主题模式变更 → 应用到 nativeTheme（任务3，PRD P1 #51）
    if (!prev || prev.themeMode !== next.themeMode) {
      applyTheme(next.themeMode)
    }

    // 服务端口变更 → 重启服务生效（任务4，PRD P1 #52）
    // prev 为 null 表示初始化阶段，不触发重启（服务尚未启动或刚启动用同一端口）
    if (prev && prev.serverPort !== next.serverPort) {
      logger.log('info', `端口设置变更：${prev.serverPort} → ${next.serverPort}`)
      // 异步重启，不阻塞事件回调；restartServices 内部已有错误处理与日志
      restartServices()
    }

    // 最小化到托盘变更（任务6）：仅记录日志，close 事件会实时读取最新设置
    if (prev && prev.minimizeToTray !== next.minimizeToTray) {
      logger.log('info', `最小化到托盘已${next.minimizeToTray ? '开启' : '关闭'}`)
    }

    // 免确认连接变更 → 同步到 connection manager
    if (!prev || prev.autoApproveConnect !== next.autoApproveConnect) {
      try {
        const { manager: connection } = require('../core/connection')
        connection.setAutoApprove(next.autoApproveConnect !== false)
        logger.log('info', `免确认连接已${next.autoApproveConnect !== false ? '开启' : '关闭'}`)
      } catch (_e) { /* 忽略 */ }
    }
  })
}

/**
 * 订阅系统级事件（任务2/3）
 * - 新增日志 → 推送给渲染进程日志面板
 * - 系统主题变化 → 推送当前 effective 主题给渲染进程（仅 themeMode=system 时有意义）
 */
function bindSystemEvents() {
  // 新增日志 → 推送给渲染进程日志面板（任务2，PRD P1 #50）
  logger.onAdd(entry => sendToRenderer('otm:log', entry))

  // 系统主题变化 → 推送当前 effective 主题给渲染进程（任务3，PRD P1 #51）
  try {
    nativeTheme.on('updated', () => {
      sendToRenderer('otm:theme', { shouldUseDarkColors: nativeTheme.shouldUseDarkColors })
    })
  } catch (err) {
    logger.log('warn', '监听系统主题变化失败：' + (err && err.message ? err.message : err))
  }
}

/**
 * 启动应用：创建窗口 → 初始化控制层 → 绑定事件/IPC → 启动服务
 */
async function startApp() {
  // 0. 初始化设置模块（从持久化文件加载，失败回退默认值）
  settings = settingsStore.init(app.getPath('userData'))
  logger.log('info', '应用启动，设置已加载')

  // 0.1 应用初始主题到系统级 nativeTheme（任务3，PRD P1 #51）
  applyTheme(settings.themeMode)

  // 1. 创建窗口
  createWindow()

  // 1.1 创建系统托盘（任务6，PRD P1 #54；失败不阻断主功能）
  createTray()

  // 1.2 创建动效 overlay 窗口（等主窗口加载完成再创建，避免白屏）
  //     开发模式下因 Vite 偶尔未完全就绪，loadURL 可能返回空白，
  //     提前创建 overlay 窗口（透明 GPU 实例）会抢占 GPU 资源加重白屏。
  mainWindow.webContents.on('did-finish-load', () => {
    // 主窗口加载完成后延迟 500ms 再创建 overlay
    setTimeout(createOverlayWrapper, 500)
  })
  // 兜底：6 秒后如果 overlay 还没创建，强制创建
  setTimeout(() => {
    if (!overlayCreated) {
      overlayCreated = true
      createOverlayWrapper()
    }
  }, 6000)

  // 2. 初始化控制层（鼠标/键盘/快捷键适配器），传入加载到的设置
  control.initController(settings)

  // 2.1 同步连接免确认设置到 connection manager
  try {
    const { manager: connection } = require('../core/connection')
    connection.setAutoApprove(settings.autoApprove !== false)
  } catch (_e) { /* 忽略 */ }

  // 3. 先绑定事件与 IPC，避免漏发服务启动期间的早期事件
  bindServerEvents()
  bindIpcHandlers()
  bindSettingsChange()
  bindSystemEvents()

  // 4. 启动后端服务（HTTP + WebSocket + 二维码 + 连接管理）
  try {
    // 端口按 settings.serverPort 构造（任务4）：'auto' 用默认，数字用指定端口
    const info = await server.startServices(buildServiceOptions())
    servicesRunning = true
    console.log(`[main] 服务已启动：${info.url}`)
    logger.log('info', `服务已启动：${info.url}`)
    // 服务就绪后推送初始二维码/地址（若窗口已加载完成会立即收到）
    pushInitialState()
  } catch (err) {
    // 启动失败（如获取 IP 失败、端口占用）：通知 GUI 显示错误，不让主进程崩溃
    console.error('[main] 服务启动失败:', err)
    logger.log('error', '服务启动失败：' + (err && err.message ? err.message : String(err)))
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

// 应用退出前清理资源：销毁托盘 + 停止服务 + 销毁控制器
app.on('before-quit', async event => {
  logger.log('info', '应用正在退出')
  // 销毁托盘（任务6）
  if (tray) {
    try {
      tray.destroy()
    } catch (_e) {
      /* 忽略销毁异常 */
    }
    tray = null
  }
  if (!servicesRunning) return
  // 阻止立即退出，等异步清理完成后再 exit
  event.preventDefault()
  servicesRunning = false
  // 销毁动效 overlay 窗口
  overlay.destroyOverlay()
  try {
    await server.stopServices()
    logger.log('info', '服务已停止')
  } catch (err) {
    console.error('[main] 停止服务异常:', err)
    logger.log('error', '停止服务异常：' + (err && err.message ? err.message : err))
  }
  try {
    control.disposeController()
  } catch (err) {
    console.error('[main] 销毁控制器异常:', err)
  }
  app.exit(0)
})
