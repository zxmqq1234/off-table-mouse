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
- 远程：`git@gitee.com:ye_zhongji/off-table-mouse.git`（SSH）
- user.name：`ye_zhongji`
- **Worktree 模式**：每个板块独立分支 + worktree，位于 `.worktrees/`（已 gitignore）
- 分支命名：`类型/YYYYMMDD-简要事项`

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
- **2026-06-17**：Git 仓库初始化 + 项目骨架（合并 main）。Electron+Vue3+Vite+协议定义。
- **2026-06-17**：并行开发板块A（连接管理）+ 板块B（输入模拟），各自独立 worktree/分支，已完成推送合并 main。
  - **板块A 连接管理**：network/token/qrcode/connection/http-server/ws-server/index 共7文件。新增依赖 `ws@^8.21.0`。
  - **板块B 输入模拟**：adapter/mock-adapter/nutjs-adapter/keymap/mouse-controller/keyboard-controller/shortcut-controller/index 共8文件。适配器模式，当前 mock，Windows 切 nutjs。
- **2026-06-19**：并行开发板块C（主进程集成）+ 板块D（手机端基础），已完成推送合并 main。
  - **板块C 主进程集成**（`功能/20260619-主进程集成`）：改 main/index.js（启动服务+IPC转发+退出清理）、preload.js（window.otm API）、src-desktop/App.vue（真实GUI：状态/二维码/确认弹窗/断开/错误）。IPC 通道 `otm:` 前缀。
  - **板块D 手机端基础**（`功能/20260619-手机端基础`）：ws-client/gestures/control-events/connect-page/control-page/keyboard-panel/shortcut-panel/App.vue。PRD8.1布局+手势识别+实时键盘+快捷键。改了 vite.config.mobile.js（commonjsOptions 处理 shared CJS）。
  - 合并后全量验证：eslint 零警告、双端 vite build 成功。
- **飞书表**：已完成约 40 条（基础设施6 + 板块A连接12 + 板块B输入4 + 板块C集成3 + 板块D手机端15）。

- **2026-06-19**：设置模块（最后一个 P0）完成合并 main。core/settings.js 持久化 + 桌面端设置面板 + IPC 双向同步。冒烟测试通过。
- **里程碑：P0 全部代码完成（约41条任务）**。全链路：电脑端服务/控制/GUI/设置 + 手机端连接/控制/键盘/快捷键。eslint/build 全绿。

- **2026-06-19**：P1 增强 + 置灰入口全部完成，合并 main。
  - 板块F 手机端P1（双指长按右键+输入暂停）、板块G 桌面端P1（设备详情/日志/主题/端口/开机自启/托盘）、置灰入口面板（9项预留）
  - 全部 63 项任务代码完成
- **里程碑：PRD 全部 63 项任务代码完成（P0 33 + P1 15 + 置灰 9 + 基础设施 6）**

## 状态记录（追加）
- **2026-06-18**：诊断+修复三个问题（分支 `修复/20260617-诊断滚动动效`，已合并 main）。
  - **白屏**：主窗口 `backgroundColor: '#ffffff'`，dev 模式 `loadURL` 加 3 次重试（Vite 未就绪时避免白屏）
  - **滚动灵敏度太低**：
    - 根本原因：`nutjs-adapter.js` STEP=120 太大，前端 SCROLL_BASE=6 太小。10px*6*2/120=1 格
    - 修复：STEP 120→40，SCROLL_BASE 6→10。新链路：10px*10*2/40=5 格
    - 灵敏度浮动效果明显：2.0→5.0 从 5 格→12 格
  - **动效不显示**：全链路加 `[diag]` 日志（main→triggerEffect→_sendEffect→overlay playEffect），下次复现可看控制台定位断点
  - **清理**：`connection.js` 删不再使用的 `EventType`/`buildMessage` 导入（被动心跳后不主动发 ping），lint 零警告
- **2026-06-18**：动效修复 + 滚动调参（直接在 main 上提交，未设分支/worktree，因为改动直接推到 main 更轻量）。
  - **动效不显示根因**（第一轮）：`contextIsolation=true` 下 preload 的 `window.__overlayEffect__` 与页面 `window` 隔离，页面拿不到该函数 → 改为 `contextBridge.exposeInMainWorld('overlayEffect', { onEffect })`
  - **动效不显示根因**（第二轮，彻底修复）：`contextBridge` + `webContents.send` + `ipcRenderer.on` 链路仍然存在接收不可靠问题（偶发回调不触发）。彻底放弃 IPC 方案，改用 `overlayWindow.webContents.executeJavaScript('window.playEffect(...)')` 直调，绕过所有中间层。preload 仅保留就绪通知。overlay.html 的 `playEffect` 改为 `window.playEffect` 全局函数，2s 后自动触发自检（窗口中央涟漪+气泡，不依赖鼠标光标）。`overlayReady` 改为 `did-finish-load` + 500ms 后标记。
  - **滚动灵敏度**：默认值 2.0→5.0，滑块范围 max 10→20、step 0.5、min 0.5
- **2026-06-18**：动效视觉美化 + 诊断完成。
  - **颜色区分**：单指触碰蓝色(#3b82f6)，多指手势琥珀色(#f59e0b)，前进/返回橙色(#f97316)
  - **字体放大**：16px→24px，加粗700，间距加大
  - **动效加强**：前进→从右滑入，←返回从左滑入，带方向箭头(28px)
  - **诊断清理**：overlay控制台日志转发到主进程，可视化OVERLAY指示标
- **2026-06-18**：多显示器感知overlay + 白屏预防 + README。
  - **多显示器支持**：每个显示器一个独立overlay窗口，`getDisplayNearestPoint` 判定光标位置，
    只在该显示器窗口渲染。解决不同DPI缩放下坐标偏移和动效消失问题。
  - **白屏预防**：overlay创建延迟到主窗口 `did-finish-load` 后500ms（避免透明GPU窗口抢占资源），
    加6秒兜底创建。
  - **README**：C端场景化产品介绍，4个场景故事 + 卖点表 + 快速开始 + 手势速查。配合之前的 STEP=40 SCROLL_BASE=10，手感大幅提升

## 待决策/待办
1. **【最关键】Windows 端到端实跑验证**：控制层是 mock，需 Windows 装 `@nut-tree-fork/nut-js` + electron-rebuild，切 `control/index.js` ADAPTER_TYPE='nutjs' 后实测全流程
2. **双指滑动手势方向**：实机手感确认后可能需对调（shortcut-controller.js / gestures.js 注释标明）
3. **托盘图标**：当前用 nativeImage.createEmpty() 占位，打包时需替换为真实 .ico/.png
4. **后续迭代**：预留功能实现（蓝牙/服务器中转/PPT/媒体/手写/语音/多设备/账号/跨公网）

## 关键路径与工具备忘
- node v22.22.3 / npm 10.9.8
- 桌面端 vite dev 端口 5173，手机端 5174，HTTP/WS 服务端口 8765
- electron 主进程：`src-electron/main/index.js`（已集成服务），生产加载 `dist-desktop/index.html`
- 手机端生产构建产物 `dist-mobile/`，由电脑端 HTTP 服务托管（http-server 已实现）
- 板块A 入口：`require('./server').startServices(opts)`，事件 `on('status'|'connect_request'|'qrcode'|'control'|'disconnect'|'error')`
- 板块B 入口：`require('./control').initController(settings)` + `dispatchEvent(message, settings)` + `disposeController()`
- IPC 通道（主↔渲染）：`otm:status|qrcode|connect_request|disconnect|error`（主→渲染）；`otm:approve|reject|refresh-qrcode|disconnect|copy-url`（渲染→主）
- 手机端 WS：连接路径 `/ws`，URL 携带 `?token=`，心跳 ping/pong，非主动断开自动重连3次
- 设置项持久化在 `userData/settings.json`（core/settings.js），main 启动加载，IPC `otm:get-settings|update-settings|reset-settings|settings`
- lark-cli 文件参数必须用相对路径（当前目录内）

## 状态记录（追加）
- **2026-06-17**：板块A《连接管理服务层》完成（分支 `功能/20260617-连接管理服务`，worktree `.worktrees/conn`）。
  - 已实现文件：`src-electron/core/{network,token,qrcode,connection}.js` + `src-electron/server/{http-server,ws-server,index}.js`
  - 核心能力：局域网IP识别、一次性Token（刷新即失效）、二维码、HTTP服务（静态托管/开发代理）、WS服务（Token鉴权+应用层心跳+控制事件转发）、连接状态机、单设备限制、用户确认、强制断开
  - 验证：`node --check` 全过、`npx eslint src-electron/server src-electron/core` 零警告、冒烟测试通过（错误token拒绝/正确token批准/ping-pong/控制事件转发/强制断开/状态机流转）
  - 依赖：`ws@^8.21.0` 已写入 `dependencies`
  - 对接板块B（控制层）：`server/index.js` 通过 EventEmitter `'control'` 事件转发 message（结构 = protocol.js 通用字段 `{type,token,clientId,timestamp,payload}`，type 见 EventType 枚举）。板块B订阅 `services.on('control', message => ...)` 消费即可
  - 集成点（合并阶段再做）：`src-electron/main/index.js` 在 `app.whenReady()` 后调 `require('./server').startServices()`，订阅 `on('qrcode'/'status'/'connect_request'/'disconnect'/'error')` 驱动 GUI；用户确认按钮调 `approveConnect()/rejectConnect()`
- **2026-06-19**：板块D《手机网页端基础》完成（分支 `功能/20260619-手机端基础`，worktree `.worktrees/mobile`，已推送 origin）。
  - 新增文件（`src-mobile/src/`）：
    - `ws-client.js`：WS 客户端封装（connect_request 携 token / approved·rejected·force_disconnect 回执 / ping-pong 心跳+45s超时 / 非主动断开自动重连2s×3 / close 发 disconnect）
    - `gestures.js`：手势识别（纯逻辑）。单指点击/双击/移动/长按/长按拖拽；双指点击(右键)/水平滑动；三指水平滑动/垂直上滑。多指用 identifier Map 追踪，质心判向
    - `control-events.js`：手势→协议消息工厂（buildMessage）
    - `connect-page.vue`：解析 `?token=`→构造 `ws(s)://host/ws`→建连→状态展示(spinner)→拒绝/失败重试；无 token 提示无效
    - `control-page.vue`：PRD8.1 布局。触控区接 recognizer；move 60fps 节流；左键按钮短按click/长按down进入拖拽方式二；边缘持续移动(距边8px停留300ms)；竖向/横向滚动区；底部工具栏
    - `keyboard-panel.vue`：实时输入。input diff 同步新增/删除；compositionstart/end 守卫中文中间态不上屏；Enter→keyboard_key
    - `shortcut-panel.vue`：快捷键网格 P0(复制/粘贴/回车/退出/删除/桌面)+P1(剪切/撤销/全选/Delete/Tab/任务切换)
  - 改造：`App.vue`（connect/control 视图组装，props 传 wsClient）、`style.css`（100dvh/dvw 移动适配）
  - 配套配置：`vite.config.mobile.js` 增 `build.commonjsOptions.include=[/[/\\]shared[/\\]/, /node_modules/]`。原因：生产构建 rollup 默认不处理项目内别名指向的 CJS 源（shared/*.js 与 Electron 共用保持 CJS），命名导入会报 not exported。
  - 验证：`npm run build:mobile` 通过（26 模块，78.9KB/gzip30.9KB）；`npx eslint src-mobile/src` 零警告
  - 对接协议点（与板块A ws-server 一致）：WS 路径 `/ws`（ws-server 未限 path）；token 注入通用字段 `message.token`（ws-server extractToken 优先取之）；控制事件必须 connect_approved 后发（未鉴权被 ws-server 忽略）
  - 遗留风险：①无法真机联调，手势手感/边缘阈值/节流需实机微调；②双指滑动方向（PRD9.5 "左→右=后退" vs 板块B 反向解读）仍待实机确认，本端语义=从左→右滑发 `two_finger_swipe_right`；③拖拽方式一(长按)/方式二(按住左键)未互斥，极端同时操作可能重复 down（实际二选一不冲突）；④设置项用 DEFAULT_SETTINGS 占位，板块E 接入响应式同步

