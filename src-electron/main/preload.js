/**
 * 预加载脚本
 *
 * 在渲染进程（桌面端 GUI）加载前执行，运行在隔离的上下文中。
 * 通过 contextBridge 暴露安全 API（window.otm），避免直接暴露 ipcRenderer。
 *
 * 暴露内容：
 *  - platform：运行平台
 *  - on* 系列方法：订阅主进程推送的事件（状态/二维码/连接请求/断开/错误）
 *  - 发送类方法：允许/拒绝连接、刷新二维码、断开、复制地址
 *
 * 每个 on* 方法会先清除同通道旧监听，防止重复注册导致回调被多次触发。
 * 通道名与主进程 main/index.js 严格对应（otm:xxx 前缀）。
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 订阅某个通道的事件回调（先清旧监听，再注册新的，保证回调唯一）
 * @param {string} channel IPC 通道名
 * @param {(data:any)=>void} callback 收到主进程数据时的回调
 * @returns {() => void} 取消订阅函数
 */
function subscribe(channel, callback) {
  if (typeof callback !== 'function') return () => {}
  ipcRenderer.removeAllListeners(channel)
  const handler = (_event, data) => callback(data)
  ipcRenderer.on(channel, handler)
  // 返回取消订阅函数，便于组件卸载时清理
  return () => ipcRenderer.removeListener(channel, handler)
}

// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('otm', {
  // 平台标识，便于渲染进程区分运行环境
  platform: process.platform,

  // —— 订阅主进程推送事件 ——
  /** 连接状态变化，payload: { state, device } */
  onStatus: cb => subscribe('otm:status', cb),
  /** 二维码更新，payload: { token, url, qrCodeDataURL } */
  onQrcode: cb => subscribe('otm:qrcode', cb),
  /** 手机连接请求，payload: { token, device }（应弹窗确认） */
  onConnectRequest: cb => subscribe('otm:connect_request', cb),
  /** 连接断开，payload: { reason } */
  onDisconnect: cb => subscribe('otm:disconnect', cb),
  /** 错误提示，payload: { message } */
  onError: cb => subscribe('otm:error', cb),
  /** 设置项变更/初始化推送，payload: 完整 settings 对象 */
  onSettings: cb => subscribe('otm:settings', cb),

  // —— 向主进程发送指令 ——
  /** 允许当前连接请求 */
  approveConnect: () => ipcRenderer.send('otm:approve'),
  /** 拒绝当前连接请求 */
  rejectConnect: () => ipcRenderer.send('otm:reject'),
  /** 刷新二维码（旧 Token 失效） */
  refreshQRCode: () => ipcRenderer.send('otm:refresh-qrcode'),
  /** 主动断开已连接的手机 */
  disconnectClient: () => ipcRenderer.send('otm:disconnect'),
  /** 复制连接地址到系统剪贴板 */
  copyUrl: url => ipcRenderer.send('otm:copy-url', url),

  // —— 设置相关 ——
  /** 获取当前设置（invoke 返回 Promise，resolve 完整 settings 对象） */
  getSettings: () => ipcRenderer.invoke('otm:get-settings'),
  /** 提交设置变更（部分更新，patch 为键值对） */
  updateSettings: patch => ipcRenderer.send('otm:update-settings', patch),
  /** 重置为默认设置 */
  resetSettings: () => ipcRenderer.send('otm:reset-settings')
})
