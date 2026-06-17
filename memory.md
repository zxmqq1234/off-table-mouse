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
- **2026-06-17**：并行开发板块A（连接管理）+ 板块B（输入模拟），各自独立 worktree/分支，已完成推送。
  - **板块A 连接管理**（分支 `功能/20260617-连接管理服务`，worktree `.worktrees/conn`）：network/token/qrcode/connection/http-server/ws-server/index 共7文件。冒烟测试通过。新增依赖 `ws@^8.21.0`。
  - **板块B 输入模拟**（分支 `功能/20260617-输入模拟层`，worktree `.worktrees/input`）：adapter/mock-adapter/nutjs-adapter/keymap/mouse-controller/keyboard-controller/shortcut-controller/index 共8文件。mock 冒烟测试通过。适配器模式，当前 mock，Windows 切 nutjs。
  - 两板块通过 `shared/protocol.js` 契约解耦：A 转发 `control` 事件 → B 的 `dispatchEvent(message)` 执行。
- **飞书表**：基础设施6 + 板块A连接管理12 + 板块B输入模拟4 = 共22条已完成。

## 待决策/待办
1. **双指滑动手势方向**：PRD 9.5（"左→右滑=后退"）与板块B实现存在反向解读，实机手感确认后可能需对调两行映射（`shortcut-controller.js` 已注释标明）
2. **nut.js Windows 验证**：板块B 代码已写好，需在 Windows 装 `@nut-tree-fork/nut-js` + electron-rebuild 实测
3. **两分支合并 main**：板块A、B 分支已推送，待老板授权是否合并
4. **主进程集成**：`src-electron/main/index.js` 需在 `app.whenReady()` 调 `startServices()` 并订阅事件驱动 GUI（板块A/B 合并后做）
5. **下一步板块**：手机端基础（连接页 #20 + 主控制布局 #21），依赖板块A WS协议

## 关键路径与工具备忘
- node v22.22.3 / npm 10.9.8
- 桌面端 vite dev 端口 5173，手机端 5174
- electron 主进程：`src-electron/main/index.js`，生产加载 `dist-desktop/index.html`
- 手机端生产构建产物 `dist-mobile/`，由电脑端 HTTP 服务托管（板块A 已实现 http-server）
- 板块A 入口：`require('./server').startServices(opts)`，事件 `on('status'|'connect_request'|'qrcode'|'control'|'disconnect'|'error')`
- 板块B 入口：`require('./control').initController(settings)` + `dispatchEvent(message, settings)`
- lark-cli 文件参数必须用相对路径（当前目录内）

