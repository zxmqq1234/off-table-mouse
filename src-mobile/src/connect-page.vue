<!--
  连接页（PRD 6 / 7.6）

  流程：解析 URL ?token= → 构造 wsUrl → 创建 ws-client → connect_request
  → 等待电脑端 connect_approved / connect_rejected。
  - 无 token：提示无效连接
  - 被拒绝：提示并提供重试（重新走扫码 / 刷新 token）
  - 已连接：emit('connected', client) 交由父组件切到控制页
-->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createClient } from './ws-client'

const emit = defineEmits(['connected'])

// 状态机：invalid | connecting | pending | connected | rejected | disconnected | reconnecting | failed | error
const status = ref('init')
const reconnectInfo = ref(0)

let client = null

/** 根据状态映射中文文案 */
const statusText = {
  connecting: '正在连接电脑...',
  pending: '等待电脑端确认...',
  connected: '已连接',
  rejected: '电脑端拒绝了连接',
  disconnected: '连接已断开',
  reconnecting: '正在重连',
  failed: '连接失败，请重试',
  error: '连接出错',
  init: '准备中...'
}

/** 状态变更处理 */
function handleStatus(s, detail) {
  status.value = s
  if (s === 'reconnecting') reconnectInfo.value = detail || 0
  if (s === 'connected') {
    // 把 client 实例交给父组件，切到控制页
    emit('connected', client)
  }
}

/** 开始连接 */
function start() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (!token) {
    status.value = 'invalid'
    return
  }

  // 把页面地址 http(s):// 换成 ws(s)://，path 用 /ws
  // （电脑端 ws-server 未限制 path，/ws 可建立连接且语义清晰）
  const loc = window.location
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${loc.host}/ws`

  client = createClient({
    url: wsUrl,
    token,
    onStatus: handleStatus,
    onMessage: () => {},
    onDisconnect: () => {}
  })
  client.connect()
}

/** 重试：重新加载页面，重新走 token 流程 */
function retry() {
  window.location.reload()
}

onMounted(start)

onUnmounted(() => {
  // 已连接时 client 交给父组件，这里不主动关闭
  // 仅在未连接成功时清理
  if (status.value !== 'connected') {
    client?.close()
  }
})
</script>

<template>
  <div class="cp">
    <div class="logo">
      桌外鼠标
    </div>

    <!-- 无效连接（无 token） -->
    <template v-if="status === 'invalid'">
      <p class="msg">
        无效连接，请重新扫码
      </p>
    </template>

    <!-- 加载中：connecting / pending / reconnecting -->
    <template v-else-if="['connecting', 'pending', 'reconnecting', 'init'].includes(status)">
      <div class="spinner" />
      <p class="msg">
        {{ statusText[status] }}
        <span v-if="status === 'reconnecting'">（{{ reconnectInfo }}/3）</span>
      </p>
    </template>

    <!-- 被拒绝 -->
    <template v-else-if="status === 'rejected'">
      <p class="msg danger">
        电脑端拒绝了连接
      </p>
      <button
        class="btn"
        @click="retry"
      >
        重试
      </button>
    </template>

    <!-- 断开 / 失败 / 错误 -->
    <template v-else-if="['disconnected', 'failed', 'error'].includes(status)">
      <p class="msg danger">
        {{ statusText[status] }}
      </p>
      <button
        class="btn"
        @click="retry"
      >
        重试
      </button>
    </template>
  </div>
</template>

<style scoped>
.cp {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
}
.logo {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 2px;
}
.msg {
  font-size: 15px;
  color: #6b7280;
  text-align: center;
}
.msg.danger {
  color: #dc2626;
}
.btn {
  padding: 10px 28px;
  font-size: 15px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  background: #f9fafb;
}
/* CSS spinner 加载动画 */
.spinner {
  width: 34px;
  height: 34px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
