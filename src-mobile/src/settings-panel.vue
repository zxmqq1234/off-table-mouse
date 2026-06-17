<!--
  手机端设置面板

  功能：
   - 鼠标/滚动灵敏度滑块（数值，DPI 风格）
   - 加速度/手势/拖拽/实时输入 开关
   - 设置变更实时通过 WS 同步到电脑端（电脑端应用+落盘）
   - 本地 localStorage 持久化，下次连接自动恢复

  数据流：
   - 挂载时从 localStorage 读取上次设置，无则用 DEFAULT_SETTINGS
   - 用户改动 → 即时存 localStorage + 通过 wsClient 下发 SETTING_UPDATE 给电脑端
-->
<script setup>
import { reactive, watch, onMounted } from 'vue'
import { DEFAULT_SETTINGS } from '@shared/constants.js'
import { EventType, buildMessage } from '@shared/protocol.js'

const props = defineProps({
  // ws-client 实例（用于下发设置到电脑端）
  wsClient: { type: Object, default: null }
})
const emit = defineEmits(['close'])

// localStorage 存储键
const STORAGE_KEY = 'otm-mobile-settings'

// 本地表单（与 DEFAULT_SETTINGS 同结构）
const form = reactive({ ...DEFAULT_SETTINGS })

/**
 * 从 localStorage 加载上次设置（merge 默认值，保证新版本字段补全）
 */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (key in saved && saved[key] !== undefined && saved[key] !== null) {
          form[key] = saved[key]
        }
      })
    }
  } catch (_e) {
    // 解析失败忽略，用默认值
  }
}

/**
 * 保存到 localStorage
 */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form }))
  } catch (_e) {
    // 存储满/隐私模式忽略
  }
}

/**
 * 把当前设置通过 WS 下发给电脑端（电脑端应用+落盘）
 */
function syncToDesktop() {
  if (!props.wsClient) return
  props.wsClient.send(buildMessage(EventType.SETTING_UPDATE, { settings: { ...form } }))
}

/**
 * 监听表单变化：存 localStorage + 下发电脑端
 * 用 watch deep 监听所有字段变化
 */
watch(
  form,
  () => {
    saveToStorage()
    syncToDesktop()
  },
  { deep: true }
)

/** 重置为默认设置 */
function handleReset() {
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    form[key] = DEFAULT_SETTINGS[key]
  })
  // watch 会自动触发存盘+同步
}

onMounted(() => {
  loadFromStorage()
  // 挂载后立即同步一次，确保电脑端与手机端设置一致
  syncToDesktop()
})
</script>

<template>
  <div
    class="sp-scrim"
    @click.self="emit('close')"
  >
    <div class="sp-panel">
      <div class="sp-bar">
        <span class="sp-title">设置</span>
        <button
          class="sp-close"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>

      <div class="sp-body">
        <!-- 鼠标 -->
        <section class="sp-group">
          <h3 class="sp-group-title">
            鼠标
          </h3>
          <div class="sp-row">
            <label class="sp-label">鼠标灵敏度</label>
            <div class="sp-slider-row">
              <input
                v-model.number="form.mouseSensitivity"
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                class="sp-slider"
              >
              <span class="sp-slider-value">{{ Number(form.mouseSensitivity).toFixed(1) }}×</span>
            </div>
          </div>
          <div class="sp-row">
            <label class="sp-label">鼠标加速度</label>
            <input
              v-model="form.mouseAcceleration"
              type="checkbox"
              class="sp-checkbox"
            >
          </div>
        </section>

        <!-- 滚动 -->
        <section class="sp-group">
          <h3 class="sp-group-title">
            滚动
          </h3>
          <div class="sp-row">
            <label class="sp-label">竖向滚动灵敏度</label>
            <div class="sp-slider-row">
              <input
                v-model.number="form.verticalScrollSensitivity"
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                class="sp-slider"
              >
              <span class="sp-slider-value">{{ Number(form.verticalScrollSensitivity).toFixed(1) }}×</span>
            </div>
          </div>
          <div class="sp-row">
            <label class="sp-label">横向滚动灵敏度</label>
            <div class="sp-slider-row">
              <input
                v-model.number="form.horizontalScrollSensitivity"
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                class="sp-slider"
              >
              <span class="sp-slider-value">{{ Number(form.horizontalScrollSensitivity).toFixed(1) }}×</span>
            </div>
          </div>
          <div class="sp-row">
            <label class="sp-label">边缘持续移动速度</label>
            <div class="sp-slider-row">
              <input
                v-model.number="form.edgeMoveSpeed"
                type="range"
                min="1"
                max="30"
                step="1"
                class="sp-slider"
              >
              <span class="sp-slider-value">{{ Math.round(form.edgeMoveSpeed) }}px</span>
            </div>
          </div>
        </section>

        <!-- 手势与操作 -->
        <section class="sp-group">
          <h3 class="sp-group-title">
            手势与操作
          </h3>
          <div class="sp-row">
            <label class="sp-label">双指手势</label>
            <input
              v-model="form.enableTwoFingerGesture"
              type="checkbox"
              class="sp-checkbox"
            >
          </div>
          <div class="sp-row">
            <label class="sp-label">三指手势</label>
            <input
              v-model="form.enableThreeFingerGesture"
              type="checkbox"
              class="sp-checkbox"
            >
          </div>
          <div class="sp-row">
            <label class="sp-label">拖拽</label>
            <input
              v-model="form.enableDrag"
              type="checkbox"
              class="sp-checkbox"
            >
          </div>
          <div class="sp-row">
            <label class="sp-label">实时输入</label>
            <input
              v-model="form.enableRealtimeInput"
              type="checkbox"
              class="sp-checkbox"
            >
          </div>
        </section>

        <button
          class="sp-reset"
          @click="handleReset"
        >
          重置为默认
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}
.sp-panel {
  width: 100%;
  max-height: 85vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.sp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sp-title {
  font-size: 16px;
  font-weight: 600;
}
.sp-close {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
}
.sp-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.sp-group {
  margin-bottom: 16px;
}
.sp-group-title {
  font-size: 14px;
  font-weight: 600;
  color: #6b7280;
  margin: 0 0 8px;
}
.sp-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f3f4f6;
}
.sp-label {
  font-size: 15px;
  color: #1f2937;
}
.sp-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 180px;
}
.sp-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e7eb;
  border-radius: 2px;
  outline: none;
}
.sp-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}
.sp-slider-value {
  min-width: 42px;
  text-align: right;
  font-size: 13px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.sp-checkbox {
  width: 20px;
  height: 20px;
}
.sp-reset {
  width: 100%;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #dc2626;
  font-size: 14px;
}
</style>
