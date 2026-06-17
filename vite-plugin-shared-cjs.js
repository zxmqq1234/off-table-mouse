// Vite 插件：dev 模式下把 shared/*.js 的 CommonJS 命名导出转换为 ESM
// 背景：shared/*.js 是 CommonJS（module.exports），与 Electron 后端 require 共用，不改。
//       build 模式由 vite.config.mobile.js 的 commonjsOptions 处理；
//       但 Vite dev 模式不转换项目源文件的 CJS，导致前端 import { EventType } 报错
//       "does not provide an export named 'EventType'"。
// 方案：拦截 shared/*.js 请求 → 用 Node require 真实执行 CJS 得到准确的导出键列表
//       → 读取原代码 → 包装成 ESM（提供局部 module/exports 执行原 CJS，末尾生成静态命名导出）。
//       带 mtime 缓存，文件改动自动失效；HMR 时 Vite 触发 load，会按新 mtime 重新转换。
import { createRequire } from 'module'
import { readFileSync, statSync } from 'fs'
import { resolve } from 'path'

/**
 * @param {string} sharedDir shared 目录绝对路径
 */
export function sharedCjsToEsm(sharedDir) {
  const sharedAbs = resolve(sharedDir).replace(/\\/g, '/')
  const cache = new Map() // key = 文件路径 + mtime
  // Vite 配置是 ESM，用 createRequire 拿到 Node 的 require 来加载 CJS
  const nodeRequire = createRequire(import.meta.url)

  return {
    name: 'shared-cjs-to-esm',
    enforce: 'pre',
    load(id) {
      const normalized = id.replace(/\\/g, '/')
      // 仅处理 shared 目录下的 .js 文件
      if (!normalized.startsWith(sharedAbs) || !normalized.endsWith('.js')) return null

      // 以 mtime 为缓存键，文件改动后自动失效
      const mtime = statSync(id).mtimeMs
      const cacheKey = id + ':' + mtime
      if (cache.has(cacheKey)) return cache.get(cacheKey)

      // 用 Node 真实执行 CJS，拿到准确的命名导出列表（比静态分析可靠）
      const resolved = nodeRequire.resolve(id)
      delete nodeRequire.cache[resolved] // 清旧缓存，确保拿到最新执行结果
      const cjsExports = nodeRequire(id)
      const names = Object.keys(cjsExports)

      // 读原代码，包装成 ESM：
      // 把原 CJS 代码包进 IIFE（提供局部 module/exports），避免其内部的顶层 const
      // （如 const EventType）泄漏到 ESM 顶层与下方生成的 export const 冲突。
      // IIFE 执行后从 __module.exports 取值，按真实导出键生成静态命名导出。
      const original = readFileSync(id, 'utf8')
      const parts = [
        '// [shared-cjs-to-esm] 自动生成的 ESM 包装层',
        'const __module = { exports: {} };',
        '(function (module, exports) {',
        original,
        '})(__module, __module.exports);',
        'const __exp = __module.exports;',
        ...names.map((n) =>
          n === 'default'
            ? 'export default __exp;'
            : `export const ${n} = __exp.${n};`
        )
      ]
      const code = parts.join('\n')

      // 清除同文件旧 mtime 的缓存条目
      for (const key of cache.keys()) {
        if (key.startsWith(id + ':')) cache.delete(key)
      }
      cache.set(cacheKey, code)
      return code
    }
  }
}
