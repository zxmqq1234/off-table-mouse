/**
 * overlay 窗口的预加载脚本（极简）
 *
 * 安全约束：contextIsolation=true，nodeIntegration=false。
 * 只暴露一个受控接口 window.__overlayEffect__，让 overlay.html 注册回调，
 * 避免渲染进程直接访问 ipcRenderer / Node API。
 */
/* global window */
const { ipcRenderer } = require('electron')

/**
 * @param {(data:{x:number,y:number,effect:string,text?:string})=>void} cb 动效回调
 */
window.__overlayEffect__ = function (cb) {
  ipcRenderer.on('otm:overlay-effect', (_event, data) => {
    try { cb(data) } catch (_e) { /* 吞异常避免 overlay 崩溃 */ }
  })
}
