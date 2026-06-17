/**
 * 预加载脚本
 *
 * 在渲染进程（桌面端 GUI）加载前执行，运行在隔离的上下文中。
 * 通过 contextBridge 暴露安全 API 给渲染进程使用。
 *
 * 后续会暴露：连接状态、二维码数据、设置读写等与主进程通信的接口。
 */

const { contextBridge, ipcRenderer } = require('electron')

// 暴露给渲染进程的安全 API（当前为占位，后续逐步补充）
contextBridge.exposeInMainWorld('otm', {
  // 平台标识，便于渲染进程区分运行环境
  platform: process.platform,
  // IPC 通道占位：后续用于渲染进程与主进程通信（如刷新二维码、断开连接等）
  on: (channel, callback) => ipcRenderer.on(channel, (_event, data) => callback(data)),
  send: (channel, data) => ipcRenderer.send(channel, data)
})
