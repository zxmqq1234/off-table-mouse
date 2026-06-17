// 桌面端（电脑端 GUI 渲染进程）Vite 构建配置
// root 指向 src-desktop，开发端口 5173，构建产物输出到 dist-desktop
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  root: 'src-desktop',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src-desktop/src'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: resolve(__dirname, 'dist-desktop'),
    emptyOutDir: true
  }
})
