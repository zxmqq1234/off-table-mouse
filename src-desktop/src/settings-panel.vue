<!--
  桌外鼠标 - 电脑端设置面板（对应 PRD 7.5）

  功能：
   - 鼠标灵敏度 / 加速度
   - 竖向 / 横向滚动灵敏度
   - 边缘持续移动速度
   - 点击 / 长按 / 双击判定时间
   - 双指 / 三指手势 / 拖拽 / 实时输入开关
   - 服务端口（可编辑，留空=自动）
   - 主题模式
   - 开机自启动（系统级）
   - 关闭时最小化到托盘
   - 重置默认

  数据流：
   - 挂载时通过 otm.getSettings() 拉取当前设置
   - 订阅 otm.onSettings 接收主进程推送（变更后回填，保持与主进程一致）
   - 用户改动即时通过 otm.updateSettings(patch) 提交（主进程落盘并下发控制层）
-->
<script setup>
import { ref, reactive, onMounted, watch } from 'vue'

// visible 通过模板使用，无需在 script 中引用 props 变量
defineProps({
  // 是否显示
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

const otm = typeof window !== 'undefined' ? window.otm : undefined

// 本地表单状态（与主进程 settings 同步）
// 灵敏度统一为数值（DPI 风格）：鼠标/滚动=倍率(0.1~10.0)，边缘移动=每帧像素(1~30)
const form = reactive({
  mouseSensitivity: 3.0,
  mouseAcceleration: true,
  verticalScrollSensitivity: 2.0,
  horizontalScrollSensitivity: 2.0,
  edgeMoveSpeed: 12,
  clickThreshold: 200,
  longPressThreshold: 500,
  doubleClickInterval: 300,
  enableTwoFingerGesture: true,
  enableThreeFingerGesture: true,
  enableDrag: true,
  enableRealtimeInput: true,
  serverPort: 'auto',
  themeMode: 'system',
  minimizeToTray: true,
  autoApproveConnect: true
})

// 开机自启动状态（系统级，独立于 settings.json；通过 IPC 读写）
const autoLaunch = ref(false)
// 端口输入临时值：'auto' 时输入框留空，聚焦时提示
const portInput = ref('')

// 标记是否正在用主进程推送回填，避免回填触发 watch 又提交一次
let syncing = false

// 旧灵敏度档位 → 数值倍率（向后兼容已保存的旧 settings.json）
const LEGACY_SENSITIVITY = { low: 0.6, medium: 1.0, high: 1.6 }

/**
 * 把灵敏度值归一化为数值（兼容旧字符串档位）
 * @param {string|number} val
 * @param {number} fallback 兜底默认值
 * @returns {number}
 */
function toNumberSensitivity(val, fallback) {
  if (typeof val === 'string' && LEGACY_SENSITIVITY[val] != null) return LEGACY_SENSITIVITY[val]
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

/**
 * 用主进程返回的完整设置回填表单
 */
function applySettings(data) {
  if (!data || typeof data !== 'object') return
  syncing = true
  Object.keys(form).forEach(key => {
    if (key in data) form[key] = data[key]
  })
  // 灵敏度字段：兼容旧字符串档位，归一化为数值
  form.mouseSensitivity = toNumberSensitivity(data.mouseSensitivity, 3.0)
  form.verticalScrollSensitivity = toNumberSensitivity(data.verticalScrollSensitivity, 2.0)
  form.horizontalScrollSensitivity = toNumberSensitivity(data.horizontalScrollSensitivity, 2.0)
  form.edgeMoveSpeed = toNumberSensitivity(data.edgeMoveSpeed, 12)
  // 端口回填到输入框：'auto' 显示空（占位提示"自动"）
  portInput.value = form.serverPort === 'auto' ? '' : String(form.serverPort)
  // 下个微任务后解除 syncing 标志，让后续用户改动能正常提交
  Promise.resolve().then(() => {
    syncing = false
  })
}

/** 端口输入框失焦：空值=自动，数字=指定端口 */
function onPortBlur() {
  const v = portInput.value.trim()
  if (!v) {
    form.serverPort = 'auto'
  } else {
    const num = Number(v)
    if (Number.isFinite(num) && num > 0 && num < 65536) {
      form.serverPort = num
    } else {
      // 非法值回退自动
      portInput.value = ''
      form.serverPort = 'auto'
    }
  }
}

/** 开机自启动开关 */
function toggleAutoLaunch() {
  autoLaunch.value = !autoLaunch.value
  if (otm) otm.setAutoLaunch(autoLaunch.value)
}

// 监听表单变化，用户改动时即时提交（syncing 期间的回填不提交）
watch(
  form,
  () => {
    if (syncing) return
    if (otm) otm.updateSettings({ ...form })
  },
  { deep: true }
)

/** 重置为默认设置 */
function handleReset() {
  if (otm) otm.resetSettings()
}

onMounted(async () => {
  if (!otm) return
  // 拉取初始设置
  const data = await otm.getSettings()
  applySettings(data)
  // 拉取开机自启动状态（系统级，独立于 settings.json）
  autoLaunch.value = await otm.getAutoLaunch()
  // 订阅主进程推送（重置 / 其他途径变更时同步）
  otm.onSettings(next => applySettings(next))
})
</script>

<template>
  <transition name="slide">
    <div
      v-if="visible"
      class="settings-mask"
      @click.self="emit('close')"
    >
      <div class="settings-panel">
        <div class="panel-header">
          <h2 class="panel-title">
            设置
          </h2>
          <button
            class="btn-close"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="panel-body">
          <!-- 鼠标 -->
          <section class="group">
            <h3 class="group-title">
              鼠标
            </h3>
            <div class="row">
              <label class="row-label">鼠标灵敏度</label>
              <div class="slider-row">
                <input
                  v-model.number="form.mouseSensitivity"
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  class="slider"
                >
                <span class="slider-value">{{ Number(form.mouseSensitivity).toFixed(1) }}×</span>
              </div>
            </div>
            <div class="row">
              <label class="row-label">鼠标加速度</label>
              <input
                v-model="form.mouseAcceleration"
                type="checkbox"
                class="checkbox"
              >
            </div>
          </section>

          <!-- 滚动 -->
          <section class="group">
            <h3 class="group-title">
              滚动
            </h3>
            <div class="row">
              <label class="row-label">竖向滚动灵敏度</label>
              <div class="slider-row">
                <input
                v-model.number="form.verticalScrollSensitivity"
                type="range"
                min="0.5"
                max="20"
                step="0.5"
                class="slider"
                >
                <span class="slider-value">{{ Number(form.verticalScrollSensitivity).toFixed(1) }}×</span>
              </div>
            </div>
            <div class="row">
              <label class="row-label">横向滚动灵敏度</label>
              <div class="slider-row">
                <input
                v-model.number="form.horizontalScrollSensitivity"
                type="range"
                min="0.5"
                max="20"
                step="0.5"
                class="slider"
                >
                <span class="slider-value">{{ Number(form.horizontalScrollSensitivity).toFixed(1) }}×</span>
              </div>
            </div>
            <div class="row">
              <label class="row-label">边缘持续移动速度</label>
              <div class="slider-row">
                <input
                  v-model.number="form.edgeMoveSpeed"
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  class="slider"
                >
                <span class="slider-value">{{ Math.round(form.edgeMoveSpeed) }}px</span>
              </div>
            </div>
          </section>

          <!-- 触控判定 -->
          <section class="group">
            <h3 class="group-title">
              触控判定
            </h3>
            <div class="row">
              <label class="row-label">点击判定时间 {{ form.clickThreshold }}ms</label>
            </div>
            <input
              v-model.number="form.clickThreshold"
              type="range"
              min="100"
              max="400"
              step="10"
              class="range"
            >
            <div class="row">
              <label class="row-label">长按判定时间 {{ form.longPressThreshold }}ms</label>
            </div>
            <input
              v-model.number="form.longPressThreshold"
              type="range"
              min="300"
              max="1000"
              step="50"
              class="range"
            >
            <div class="row">
              <label class="row-label">双击间隔 {{ form.doubleClickInterval }}ms</label>
            </div>
            <input
              v-model.number="form.doubleClickInterval"
              type="range"
              min="200"
              max="500"
              step="10"
              class="range"
            >
          </section>

          <!-- 功能开关 -->
          <section class="group">
            <h3 class="group-title">
              功能开关
            </h3>
            <div class="row">
              <label class="row-label">启用双指手势</label>
              <input
                v-model="form.enableTwoFingerGesture"
                type="checkbox"
                class="checkbox"
              >
            </div>
            <div class="row">
              <label class="row-label">启用三指手势</label>
              <input
                v-model="form.enableThreeFingerGesture"
                type="checkbox"
                class="checkbox"
              >
            </div>
            <div class="row">
              <label class="row-label">启用拖拽</label>
              <input
                v-model="form.enableDrag"
                type="checkbox"
                class="checkbox"
              >
            </div>
            <div class="row">
              <label class="row-label">启用实时输入</label>
              <input
                v-model="form.enableRealtimeInput"
                type="checkbox"
                class="checkbox"
              >
            </div>
          </section>

          <!-- 外观与服务 -->
          <section class="group">
            <h3 class="group-title">
              外观与服务
            </h3>
            <div class="row">
              <label class="row-label">主题模式</label>
              <select
                v-model="form.themeMode"
                class="select"
              >
                <option
                  v-for="o in themeOptions"
                  :key="o.value"
                  :value="o.value"
                >
                  {{ o.label }}
                </option>
              </select>
            </div>
            <div class="row">
              <label class="row-label">服务端口</label>
              <input
                v-model="portInput"
                class="port-input"
                type="text"
                placeholder="自动"
                @blur="onPortBlur"
              >
            </div>
            <p class="port-hint">
              留空=自动（8765）；填数字=指定端口，保存后自动重启服务生效
            </p>
          </section>

          <!-- 应用级行为 -->
          <section class="group">
            <h3 class="group-title">
              应用
            </h3>
            <div class="row">
              <label class="row-label">开机自启动</label>
              <input
                :checked="autoLaunch"
                type="checkbox"
                class="checkbox"
                @change="toggleAutoLaunch"
              >
            </div>
            <div class="row">
              <label class="row-label">关闭时最小化到托盘</label>
              <input
                v-model="form.minimizeToTray"
                type="checkbox"
                class="checkbox"
              >
            </div>
            <div class="row">
              <label class="row-label">手机连接免确认</label>
              <input
                v-model="form.autoApproveConnect"
                type="checkbox"
                class="checkbox"
              >
            </div>
          </section>

          <button
            class="btn-reset"
            @click="handleReset"
          >
            恢复默认设置
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.settings-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 60;
}

.settings-panel {
  width: 100%;
  max-width: 360px;
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

.btn-close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: #6b7280;
  cursor: pointer;
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 24px;
}

.group {
  padding: 16px 0;
  border-bottom: 1px solid #f3f4f6;
}

.group:last-of-type {
  border-bottom: none;
}

.group-title {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  margin: 0 0 12px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.row-label {
  font-size: 14px;
  color: #374151;
}

.select {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
}

.checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.range {
  width: 100%;
  margin: 4px 0 12px;
}

.readonly-value {
  font-size: 13px;
  color: #9ca3af;
}

.port-input {
  width: 80px;
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  text-align: right;
}

.port-hint {
  font-size: 11px;
  color: #9ca3af;
  margin: 4px 0 0;
  line-height: 1.4;
}

.btn-reset {
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fff;
  color: #dc2626;
  font-size: 14px;
  cursor: pointer;
}

.btn-reset:hover {
  background: #fef2f2;
}

/* 灵敏度滑块行：滑块 + 数值显示 */
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  max-width: 200px;
}

.slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e5e7eb;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

/* 滑块拖动点（WebKit/Chromium） */
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  min-width: 42px;
  text-align: right;
  font-size: 13px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}

/* 侧滑动画 */
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.2s;
}

.slide-enter-active .settings-panel,
.slide-leave-active .settings-panel {
  transition: transform 0.25s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}

.slide-enter-from .settings-panel,
.slide-leave-to .settings-panel {
  transform: translateX(100%);
}
</style>
