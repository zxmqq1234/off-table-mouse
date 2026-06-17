/**
 * overlay 窗口的预加载脚本
 *
 * 安全约束：contextIsolation=true，nodeIntegration=false。
 * 通过 contextBridge 暴露 overlayEffect 接口供页面注册动效回调，
 * 并通过 IPC 通知主进程页面已就绪。
 *
 * 注意：必须用 contextBridge.exposeInMainWorld 而非 window.xxx，
 * 因为 contextIsolation=true 下 preload 的 window 与页面 window 隔离。
 * 此前用 window.__overlayEffect__ 导致页面拿不到该函数，动效静默失效。
 */
const { ipcRenderer, contextBridge } = require('electron')

// 页面就绪通知（主进程据此开始发送动效 IPC，避免发到未就绪页面丢失）
ipcRenderer.send('otm:overlay-ready')

/**
 * 暴露给页面：注册动效回调
 * @param {(data:{x:number,y:number,effect:string,text?:string})=>void} cb
 */
contextBridge.exposeInMainWorld('overlayEffect', {
  onEffect: function (cb) {
    ipcRenderer.on('otm:overlay-effect', (_event, data) => {
      try { cb(data) } catch (_e) { /* 吞异常避免 overlay 崩溃 */ }
    })
  }
})
