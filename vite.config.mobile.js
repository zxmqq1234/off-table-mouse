// 手机网页端 Vite 构建配置
// root 指向 src-mobile，开发端口 5174，构建产物输出到 dist-mobile
// 生产环境下 dist-mobile 由电脑端 Electron 的 HTTP 服务托管
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { sharedCjsToEsm } from './vite-plugin-shared-cjs.js'

export default defineConfig({
  root: 'src-mobile',
  // sharedCjsToEsm：dev 模式把 shared/*.js 的 CJS 命名导出转 ESM（build 由下方 commonjsOptions 处理）
  plugins: [vue(), sharedCjsToEsm(resolve(__dirname, 'shared'))],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src-mobile/src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  server: {
    port: 5174,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'dist-mobile'),
    emptyOutDir: true,
    // shared/*.js 为 CommonJS（与 Electron 端共用，不改），
    // 扩展 rollup commonjs 插件的处理范围，使其识别 shared 的命名导出。
    commonjsOptions: {
      include: [/[/\\]shared[/\\]/, /node_modules/],
      transformMixedEsModules: true
    }
  }
})
