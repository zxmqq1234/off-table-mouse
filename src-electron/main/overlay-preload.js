/**
 * overlay 窗口的预加载脚本（极简）
 *
 * 安全约束：contextIsolation=true，nodeIntegration=false。
 * 暴露 window.__overlayEffect__ 供页面注册动效回调，
 * 并通过 IPC 通知主进程页面已就绪。
 */
/* global window */
const { ipcRenderer } = require('electron')

// 页面就绪通知（主进程据此开始发送动效 IPC，避免发到未就绪页面丢失）
ipcRenderer.send('otm:overlay-ready')

/**
 * @param {(data:{x:number,y:number,effect:string,text?:string})=>void} cb 动效回调
 */
window.__overlayEffect__ = function (cb) {
  ipcRenderer.on('otm:overlay-effect', (_event, data) => {
    try { cb(data) } catch (_e) { /* 吞异常避免 overlay 崩溃 */ }
  })
}
