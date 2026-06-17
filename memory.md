# 《桌外鼠标 V1.0》项目记忆

## 项目概述
- **定位**：手机浏览器变电脑无线触控板/鼠标/键盘/快捷手势控制器
- **第一版目标**：局域网内低延迟鼠标控制、实时键盘输入、快捷键、滚动、拖拽、边缘持续移动、多指手势
- **运行/打包目标**：Windows（开发也在 Windows）

## 技术方案（已确认）
- 电脑端：Electron + Vue + Node.js + WebSocket
- 手机端：浏览器网页（Vue 或原生）
- 通信：HTTP（加载网页）+ WebSocket（实时控制）
- 连接：局域网二维码 + 一次性 Token + 电脑端确认
- 输入模拟库：**@nut-tree/nut-js**（已选定，Windows 低延迟）
- 默认服务端口：8765（自动）

## 飞书项目管理表（核心）
- **Base 名称**：桌外鼠标 V1.0 项目管理
- **URL**：https://my.feishu.cn/base/Ya2Sbz66KaVYi4syYeLccLb6nYy
- **base_token**：`Ya2Sbz66KaVYi4syYeLccLb6nYy`
- **table_id**：`tblRhGyetVK6qZ8q`
- **身份**：user（叶仲基，ou_1ff3493860503ef65ef1491c07e9b6f5）

### 数据表字段（9个）
| 字段名 | 类型 | 备注 |
|--------|------|------|
| 任务名称 | text（主字段） | |
| 需求类型 | select | 功能/BUG/迭代 |
| 所属端 | select | 电脑端/手机网页端/通信层/通用 |
| 所属板块 | select | 项目骨架/连接管理/鼠标控制/键盘控制/快捷键/滚动控制/手势控制/设置/安全连接/置灰预留 |
| 当前状态 | select | 待开始/进行中/已完成/被阻塞 |
| 开发阶段 | select | 基础设施/第1期-P0核心/第2期-P1增强/第3期-预留入口 |
| 需求说明 | text | 含 P0/P1 档位标记 |
| 关联文件 | text | 代码文件/目录路径（开发时填） |
| 依赖任务 | link（自关联） | field_id=`fld1sNJXuE`，表达从属/前置依赖 |

### 任务统计（共 63 条）
- 基础设施：6 条（git/目录/依赖/nut.js验证/构建脚本/lint）
- 第1期-P0核心：34 条（连接管理+安全19、手机端基础2、鼠标9、键盘4、快捷键2、手势3、设置1）
- 第2期-P1增强：14 条
- 第3期-预留入口：9 条（置灰）

## Git 配置
- 远程：Gitee
- user.name：`ye_zhongji`
- **仓库尚未初始化**（待开始开发时执行，第一条任务）

## lark-cli 配置
- 版本：1.0.55
- 认证：user 已登录（base 全量 scopes），bot 就绪
- lark-cli 文件路径参数必须用**相对路径**（当前目录内），绝对路径会被拒
- 中文 JSON 无需特殊处理（Linux bash 环境）

## 开发顺序建议（基于依赖关系）
1. 基础设施（git→目录→依赖→nut.js验证→构建脚本）
2. 电脑端服务层（IP→HTTP→WS→二维码→Token→确认→心跳→状态→单设备→断开→异常）
3. 手机端基础（连接页→主控制布局）
4. 输入控制（鼠标移动→点击→按钮→拖拽→边缘→滚动→键盘→快捷键→手势）
5. 设置模块
6. P1 增强
7. 置灰入口（仅 UI）

## 状态记录
- **2026-06-17**：飞书项目表建立完成，63 条任务含依赖关系全部就位。
- **2026-06-17**：Git 仓库初始化（main 推送），关联 Gitee（SSH）。远程：`git@gitee.com:ye_zhongji/off-table-mouse.git`
- **2026-06-17**：项目骨架完成（分支 `功能/20260617-项目骨架`，已推送）。Electron+Vue3+Vite+协议定义。npm install / 双向 vite build / lint 均通过。Electron GUI 启动需在 Windows 验证（本机 Linux 无桌面库）。
  - 已完成：Git初始化、目录脚手架、package.json依赖、构建脚本、lint配置（飞书 #1/2/3/5/6）
  - 待做：nut.js 集成与 Windows 输入模拟验证（#4，需 Windows 环境）
  - 待做：电脑端服务层（HTTP/WS/二维码/Token/连接管理）

## 关键路径与工具备忘
- npm install 已跑通（547 包），node v22.22.3
- 桌面端 vite dev 端口 5173，手机端 5174
- electron 主进程：`src-electron/main/index.js`，生产加载 `dist-desktop/index.html`
- 手机端生产构建产物 `dist-mobile/`，由电脑端 HTTP 服务托管（待实现）
- nut.js 待集成：注意 v4 需 license，应用免费版 v3.1.x；Windows 原生模块需 electron-rebuild
- lark-cli 文件参数必须用相对路径（当前目录内）

## 状态记录（追加）
- **2026-06-17**：板块A《连接管理服务层》完成（分支 `功能/20260617-连接管理服务`，worktree `.worktrees/conn`）。
  - 已实现文件：`src-electron/core/{network,token,qrcode,connection}.js` + `src-electron/server/{http-server,ws-server,index}.js`
  - 核心能力：局域网IP识别、一次性Token（刷新即失效）、二维码、HTTP服务（静态托管/开发代理）、WS服务（Token鉴权+应用层心跳+控制事件转发）、连接状态机、单设备限制、用户确认、强制断开
  - 验证：`node --check` 全过、`npx eslint src-electron/server src-electron/core` 零警告、冒烟测试通过（错误token拒绝/正确token批准/ping-pong/控制事件转发/强制断开/状态机流转）
  - 依赖：`ws@^8.21.0` 已写入 `dependencies`
  - 对接板块B（控制层）：`server/index.js` 通过 EventEmitter `'control'` 事件转发 message（结构 = protocol.js 通用字段 `{type,token,clientId,timestamp,payload}`，type 见 EventType 枚举）。板块B订阅 `services.on('control', message => ...)` 消费即可
  - 集成点（合并阶段再做）：`src-electron/main/index.js` 在 `app.whenReady()` 后调 `require('./server').startServices()`，订阅 `on('qrcode'/'status'/'connect_request'/'disconnect'/'error')` 驱动 GUI；用户确认按钮调 `approveConnect()/rejectConnect()`

