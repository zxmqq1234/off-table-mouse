/**
 * overlay 窗口的预加载脚本（极简）
 *
 * 安全约束：contextIsolation=true，nodeIntegration=false。
 * 只发送页面就绪通知。动效触发改用 webContents.executeJavaScript 直接调用
 * 页面全局函数 window.playEffect，绕开 IPC + contextBridge 的不可靠链路。
 */
const { ipcRenderer } = require('electron')

// 页面就绪通知（主进程据此开始发送动效 IPC，避免发到未就绪页面丢失）
ipcRenderer.send('otm:overlay-ready')
