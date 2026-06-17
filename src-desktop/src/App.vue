<!--
  桌外鼠标 - 电脑端 GUI 主界面（连接页）

  通过 window.otm（preload 暴露的 IPC API）与主进程双向通信：
   - 订阅：连接状态、二维码、连接请求、断开、错误
   - 发送：允许/拒绝连接、刷新二维码、断开、复制地址

  功能（对应 PRD 7.1 / 7.6）：
   - 连接状态徽章（未连接/等待连接/已连接/已断开）
   - 二维码展示与刷新
   - 连接地址显示与复制
   - 手机连接确认弹窗
   - 已连接设备信息（IP、连接时间）
   - 主动断开连接
   - 顶部错误提示 banner（可关闭）
-->
<script setup>
import { ref, computed, onMounted } from 'vue'

// preload 通过 contextBridge 暴露的 API；非 Electron 环境（纯浏览器预览）下可能为空
const otm = typeof window !== 'undefined' ? window.otm : undefined

// —— 连接状态 ——
// state 取值：idle(未连接) | waiting(等待确认) | connected(已连接) | disconnected(已断开)
const connectionStatus = ref('idle')
// 已连接/待确认设备信息：null | { ip, connectedAt } | { ip, requestedAt }
const deviceInfo = ref(null)

// —— 二维码与连接地址 ——
const qrCodeDataUrl = ref('')
const serverUrl = ref('服务启动中...')

// —— 手机连接请求（弹窗） ——
// 非 null 时显示确认弹窗：{ token, device: { ip, requestedAt } }
const connectRequest = ref(null)

// —— 错误提示 ——
const errorMessage = ref('')
let errorTimer = null

// 状态文案映射
const statusTextMap = {
  idle: '未连接',
  waiting: '等待连接',
  connected: '已连接',
  disconnected: '已断开'
}

// 是否已连接（用于控制断开按钮可用性）
const isConnected = computed(() => connectionStatus.value === 'connected')
// 是否可复制（地址就绪后才能复制）
const canCopy = computed(() => serverUrl.value.startsWith('http'))

// 把时间戳格式化为可读时间字符串
function formatTime(ts) {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 显示错误并 6 秒后自动消失
 * @param {string} msg 错误文案
 */
function showError(msg) {
  errorMessage.value = msg || '发生未知错误'
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    errorMessage.value = ''
    errorTimer = null
  }, 6000)
}

/** 关闭错误提示 */
function closeError() {
  errorMessage.value = ''
  if (errorTimer) {
    clearTimeout(errorTimer)
    errorTimer = null
  }
}

// —— 渲染进程 -> 主进程 的指令（均做空值保护，避免非 Electron 环境报错） ——
/** 允许当前连接请求 */
function approveConnect() {
  if (otm) otm.approveConnect()
  connectRequest.value = null
}
/** 拒绝当前连接请求 */
function rejectConnect() {
  if (otm) otm.rejectConnect()
  connectRequest.value = null
}
/** 刷新二维码 */
function refreshQRCode() {
  if (otm) otm.refreshQRCode()
}
/** 主动断开已连接的手机 */
function disconnectClient() {
  if (otm) otm.disconnectClient()
}
/** 复制连接地址到剪贴板 */
function copyUrl() {
  if (otm && canCopy.value) otm.copyUrl(serverUrl.value)
}

// 组件挂载后订阅主进程事件
onMounted(() => {
  if (!otm) {
    // 非 Electron 环境（如纯浏览器调试），仅给出提示
    showError('未检测到主进程 API，请在 Electron 环境中运行')
    return
  }

  // 连接状态变化：更新徽章与设备信息
  otm.onStatus(data => {
    connectionStatus.value = data.state
    deviceInfo.value = data.device || null
  })

  // 二维码更新：展示二维码图与连接地址
  otm.onQrcode(data => {
    qrCodeDataUrl.value = data.qrCodeDataURL || ''
    if (data.url) serverUrl.value = data.url
  })

  // 手机连接请求：弹出确认框
  otm.onConnectRequest(data => {
    connectRequest.value = data
  })

  // 连接断开：状态事件已覆盖徽章变化，这里仅清掉可能残留的弹窗
  otm.onDisconnect(() => {
    connectRequest.value = null
  })

  // 错误提示
  otm.onError(data => {
    showError(data && data.message ? data.message : '发生错误')
  })
})
</script>

<template>
  <div class="app">
    <!-- 顶部错误提示 banner -->
    <transition name="fade">
      <div
        v-if="errorMessage"
        class="error-banner"
      >
        <span class="error-text">{{ errorMessage }}</span>
        <button
          class="error-close"
          title="关闭"
          @click="closeError"
        >
          ×
        </button>
      </div>
    </transition>

    <!-- 顶部：产品名称与连接状态 -->
    <header class="header">
      <h1 class="title">
        桌外鼠标
      </h1>
      <span
        class="status-badge"
        :class="connectionStatus"
      >
        {{ statusTextMap[connectionStatus] }}
      </span>
    </header>

    <!-- 主区域：二维码与连接地址 -->
    <main class="main">
      <div class="qr-area">
        <!-- 二维码就绪后展示图片 -->
        <img
          v-if="qrCodeDataUrl"
          :src="qrCodeDataUrl"
          class="qr-img"
          alt="连接二维码"
        >
        <!-- 未就绪时显示占位 -->
        <div
          v-else
          class="qr-placeholder"
        >
          <span>服务启动中…</span>
        </div>
      </div>

      <div class="url-row">
        <code class="url">{{ serverUrl }}</code>
        <button
          class="btn-copy"
          title="复制连接地址"
          :disabled="!canCopy"
          @click="copyUrl"
        >
          复制
        </button>
      </div>

      <button
        class="btn-refresh"
        @click="refreshQRCode"
      >
        刷新二维码
      </button>
    </main>

    <!-- 底部：已连接设备与断开 -->
    <footer class="footer">
      <div class="device-info">
        <template v-if="isConnected && deviceInfo">
          <span>已连接：{{ deviceInfo.ip || '未知 IP' }}</span>
          <span class="muted"> · {{ formatTime(deviceInfo.connectedAt) }}</span>
        </template>
        <template v-else-if="connectionStatus === 'waiting' && deviceInfo">
          <span>请求来自：{{ deviceInfo.ip || '未知 IP' }}</span>
        </template>
        <span
          v-else
          class="muted"
        >暂无设备连接</span>
      </div>
      <button
        class="btn-disconnect"
        :disabled="!isConnected"
        @click="disconnectClient"
      >
        断开连接
      </button>
    </footer>

    <!-- 手机连接确认弹窗 -->
    <transition name="fade">
      <div
        v-if="connectRequest"
        class="modal-mask"
      >
        <div class="modal">
          <h2 class="modal-title">
            手机请求连接
          </h2>
          <p class="modal-desc">
            检测到一台手机正在请求控制本机：
          </p>
          <ul class="modal-info">
            <li>
              <span class="muted">设备 IP：</span>
              <span>{{ (connectRequest.device && connectRequest.device.ip) || '未知' }}</span>
            </li>
            <li>
              <span class="muted">请求时间：</span>
              <span>{{ formatTime(connectRequest.device && connectRequest.device.requestedAt) }}</span>
            </li>
          </ul>
          <div class="modal-actions">
            <button
              class="btn-reject"
              @click="rejectConnect"
            >
              拒绝
            </button>
            <button
              class="btn-approve"
              @click="approveConnect"
            >
              允许
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 24px;
  box-sizing: border-box;
}

/* 顶部错误提示 banner */
.error-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 13px;
  border-bottom: 1px solid #fecaca;
}

.error-close {
  border: none;
  background: transparent;
  color: #b91c1c;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  margin-top: 8px;
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
  background: #e5e7eb;
  color: #6b7280;
}

.status-badge.waiting {
  background: #fef3c7;
  color: #b45309;
}

.status-badge.connected {
  background: #dcfce7;
  color: #16a34a;
}

.status-badge.disconnected {
  background: #fee2e2;
  color: #dc2626;
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

.qr-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
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
.btn-disconnect,
.btn-approve,
.btn-reject {
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

.btn-copy:disabled {
  color: #d1d5db;
  border-color: #e5e7eb;
  cursor: not-allowed;
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

.device-info {
  font-size: 13px;
  color: #374151;
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

/* 连接确认弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}

.modal {
  width: 320px;
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 8px;
}

.modal-desc {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 12px;
}

.modal-info {
  list-style: none;
  margin: 0 0 20px;
  padding: 12px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 13px;
}

.modal-info li {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.modal-info .muted {
  color: #9ca3af;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-reject {
  color: #6b7280;
}

.btn-approve {
  color: #fff;
  background: #16a34a;
  border-color: #16a34a;
}

.btn-approve:hover {
  background: #15803d;
  border-color: #15803d;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
