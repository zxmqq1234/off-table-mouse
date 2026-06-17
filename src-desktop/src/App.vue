<!--
  桌外鼠标 - 电脑端 GUI 主界面（骨架）

  当前为连接页占位布局，后续逐步实现：
  - 连接状态显示（未连接/等待连接/已连接/已断开）
  - 局域网连接地址
  - 二维码展示与刷新
  - 手机连接确认弹窗
  - 已连接设备信息
  - 断开连接按钮
-->
<script setup>
import { ref } from 'vue'

// 连接状态：后续由主进程通过 IPC 推送更新
const connectionStatus = ref('idle') // idle | waiting | connected | disconnected

// 状态文案映射
const statusText = {
  idle: '未连接',
  waiting: '等待连接',
  connected: '已连接',
  disconnected: '已断开'
}

// 连接地址占位：后续由主进程获取局域网 IP 后填充
const serverUrl = ref('服务启动中...')
</script>

<template>
  <div class="app">
    <!-- 顶部：产品名称与连接状态 -->
    <header class="header">
      <h1 class="title">
        桌外鼠标
      </h1>
      <span
        class="status-badge"
        :class="connectionStatus"
      >
        {{ statusText[connectionStatus] }}
      </span>
    </header>

    <!-- 主区域：二维码与连接地址 -->
    <main class="main">
      <div class="qr-area">
        <!-- 二维码占位：后续集成 qrcode 库生成 -->
        <div class="qr-placeholder">
          <span>二维码区域</span>
        </div>
      </div>

      <div class="url-row">
        <code class="url">{{ serverUrl }}</code>
        <button
          class="btn-copy"
          title="复制连接地址"
        >
          复制
        </button>
      </div>

      <button class="btn-refresh">
        刷新二维码
      </button>
    </main>

    <!-- 底部：已连接设备与断开 -->
    <footer class="footer">
      <div class="device-info">
        <!-- 后续显示已连接的手机 IP、设备名、连接时间 -->
        <span class="muted">暂无设备连接</span>
      </div>
      <button
        class="btn-disconnect"
        disabled
      >
        断开连接
      </button>
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px;
  box-sizing: border-box;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  background: var(--badge-bg, #e5e7eb);
  color: var(--badge-color, #6b7280);
}

.status-badge.connected {
  background: #dcfce7;
  color: #16a34a;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.qr-area {
  width: 220px;
  height: 220px;
}

.qr-placeholder {
  width: 100%;
  height: 100%;
  border: 2px dashed #d1d5db;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 320px;
}

.url {
  flex: 1;
  padding: 8px 12px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-copy,
.btn-refresh,
.btn-disconnect {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  background: #fff;
  transition: all 0.15s;
}

.btn-copy:hover,
.btn-refresh:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn-refresh {
  width: 100%;
  max-width: 320px;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
}

.device-info .muted {
  color: #9ca3af;
  font-size: 13px;
}

.btn-disconnect {
  color: #dc2626;
  border-color: #fecaca;
}

.btn-disconnect:disabled {
  color: #d1d5db;
  border-color: #e5e7eb;
  cursor: not-allowed;
}
</style>
