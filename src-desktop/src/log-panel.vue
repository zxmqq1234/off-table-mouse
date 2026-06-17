<!--
  连接日志面板（PRD P1 #50）

  功能：
   - 打开时拉取历史日志（otm.getLogs）
   - 订阅实时新增（otm.onLog），自动追加到底部
   - 按级别着色（info灰/warn橙/error红）
   - 可清空

  数据来源：主进程 core/logger.js 环形缓冲，通过 IPC otm:log 推送
-->
<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const otm = typeof window !== 'undefined' ? window.otm : undefined

// 日志条目数组：{ ts, level, message }
const logs = ref([])
// 日志列表 DOM 引用，用于自动滚动到底部
const listRef = ref(null)
// 取消订阅函数
let unsubLog = null

/** 格式化时间戳为 HH:mm:ss */
function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 滚动到底部（最新日志可见） */
function scrollToBottom() {
  nextTick(() => {
    if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
  })
}

/** 清空日志 */
function handleClear() {
  logs.value = []
}

onMounted(async () => {
  if (!otm) return
  // 拉取历史日志
  const history = await otm.getLogs()
  if (Array.isArray(history)) {
    logs.value = history
    scrollToBottom()
  }
  // 订阅实时新增
  unsubLog = otm.onLog(entry => {
    logs.value.push(entry)
    // 限制本地条数（与后端 MAX_SIZE=200 对齐，避免渲染过多 DOM）
    if (logs.value.length > 200) logs.value.shift()
    scrollToBottom()
  })
})

onUnmounted(() => {
  if (unsubLog) unsubLog()
})
</script>

<template>
  <transition name="slide">
    <div
      v-if="visible"
      class="log-mask"
      @click.self="emit('close')"
    >
      <div class="log-panel">
        <div class="panel-header">
          <h2 class="panel-title">
            连接日志
          </h2>
          <div class="header-actions">
            <button
              class="btn-clear"
              @click="handleClear"
            >
              清空
            </button>
            <button
              class="btn-close"
              @click="emit('close')"
            >
              ×
            </button>
          </div>
        </div>
        <div
          ref="listRef"
          class="log-list"
        >
          <div
            v-if="logs.length === 0"
            class="log-empty"
          >
            暂无日志
          </div>
          <div
            v-for="(entry, i) in logs"
            :key="i"
            class="log-entry"
            :class="entry.level"
          >
            <span class="log-time">{{ formatTime(entry.ts) }}</span>
            <span class="log-level">{{ entry.level }}</span>
            <span class="log-msg">{{ entry.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.log-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 60;
}

.log-panel {
  width: 100%;
  max-width: 380px;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
}

.panel-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-clear {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: #fff;
}

.btn-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.log-empty {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 40px 0;
}

.log-entry {
  display: flex;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.5;
  border-bottom: 1px solid #f9fafb;
}

.log-time {
  color: #9ca3af;
  flex-shrink: 0;
}

.log-level {
  flex-shrink: 0;
  width: 38px;
  font-weight: 600;
}

.log-entry.info .log-level {
  color: #6b7280;
}

.log-entry.warn .log-level {
  color: #d97706;
}

.log-entry.error .log-level {
  color: #dc2626;
}

.log-msg {
  color: #374151;
  word-break: break-all;
}

/* 侧滑动画 */
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s;
}

.slide-enter-active .log-panel,
.slide-leave-active .log-panel {
  transition: transform 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

.slide-enter-from .log-panel,
.slide-leave-to .log-panel {
  transform: translateX(100%);
}
</style>
