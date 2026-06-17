# 桌外鼠标 V1.0

将手机浏览器变成电脑的无线触控板、鼠标、键盘和快捷手势控制器。

## 技术栈

- **电脑端**：Electron + Vue 3 + Node.js + WebSocket
- **手机端**：浏览器网页（Vue 3 + Vite）
- **通信**：HTTP（加载网页）+ WebSocket（实时控制）
- **连接方式**：局域网二维码 + 一次性 Token + 电脑端确认
- **输入模拟**：@nut-tree/nut-js（Windows）

## 目录结构

```
off-table-mouse/
├── src-electron/       # Electron 主进程（Node.js 后端服务）
│   ├── main/           # 主进程入口与窗口管理
│   ├── server/         # HTTP + WebSocket 服务
│   ├── control/        # 鼠标/键盘/快捷键模拟（nut.js）
│   └── core/           # 连接管理、Token、二维码、设置
├── src-desktop/        # 电脑端渲染进程（Vue 3 GUI）
├── src-mobile/         # 手机网页端（Vue 3，独立构建为静态文件）
├── shared/             # 前后端共享协议与类型
├── memory.md           # 项目记忆
└── package.json
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（同时启动电脑端 + 手机端热重载）
npm run dev

# 启动 Electron 桌面客户端
npm start

# 打包 Windows 安装包
npm run build:win
```

## 项目管理

- 需求清单与进度：飞书多维表格《桌外鼠标 V1.0 项目管理》
- 项目记忆：见 `memory.md`
