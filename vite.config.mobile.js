// 手机网页端 Vite 构建配置
// root 指向 src-mobile，开发端口 5174，构建产物输出到 dist-mobile
// 生产环境下 dist-mobile 由电脑端 Electron 的 HTTP 服务托管
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: 'src-mobile',
  plugins: [vue()],
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
    emptyOutDir: true
  }
})
