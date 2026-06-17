<!--
  实时键盘输入面板（PRD 8.6 / 9.8）

  原理：用一个可见 input 唤起手机虚拟键盘，监听 input / compositionend / keydown，
  把字符变化同步给电脑端。
  - 英文/数字直接输入：input 事件 diff 出新增字符 → keyboard_text
  - 中文输入法：compositionstart→end 期间不上屏，compositionend 时把确认文字 → keyboard_text
  - 删除：input 变短 → 按差值发 N 次 Backspace；input 已空时 keydown 补发 Backspace
  - 换行：keydown Enter → keyboard_key Enter（阻止 input 产生换行符污染）

  注意：isComposing 守卫是中文兼容的核心，中间态字符绝不上屏。
-->
<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { textMessage, keyMessage } from './control-events'

const props = defineProps({
  // ws-client 实例（由控制页注入，用于发送消息）
  wsClient: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const inputRef = ref(null)
// 是否处于输入法组合态（中文/日文等未上屏期间）
const isComposing = ref(false)
// 上一次已同步给电脑的 input 值（用于 diff 新增/删除）
const lastValue = ref('')
// 输入暂停开关（手机端本地临时控制；与电脑端全局 enableRealtimeInput 设置独立，本地优先）
const paused = ref(false)

/** 切换暂停 / 继续 */
function togglePause() {
  paused.value = !paused.value
  // 恢复输入时：把 lastValue 对齐到当前 input 值，避免暂停期间的变化在恢复后被误同步
  if (!paused.value && inputRef.value) {
    lastValue.value = inputRef.value.value
  }
}

/** 发送一段文本（keyboard_text） */
function sendText(text) {
  if (!text) return
  props.wsClient?.send(textMessage(text))
}

/** 发送单个按键（keyboard_key） */
function sendKey(key) {
  props.wsClient?.send(keyMessage(key))
}

/**
 * 对比新旧值，把变化同步给电脑
 * @param {string} old 上次已同步值
 * @param {string} cur 当前值
 */
function handleDiff(old, cur) {
  if (cur.length > old.length && cur.startsWith(old)) {
    // 尾部新增字符（英文/数字直接输入）
    sendText(cur.slice(old.length))
  } else if (cur.length < old.length) {
    // 删除：按字符差值发对应次数 Backspace
    const delCount = old.length - cur.length
    for (let i = 0; i < delCount; i++) sendKey('Backspace')
  }
  // 其余情况（中间替换等）由 compositionend 兜底，这里忽略
}

/** input 事件：composition 期间不同步，否则做 diff */
function onInput(e) {
  if (paused.value) return // 输入已暂停：不上屏、不发 WS
  if (isComposing.value) return // 中间态不上屏
  const cur = e.target.value
  handleDiff(lastValue.value, cur)
  lastValue.value = cur
}

/** composition 开始：进入组合态 */
function onCompositionStart() {
  isComposing.value = true
}

/** composition 结束：把确认上屏的文字同步给电脑 */
function onCompositionEnd(e) {
  isComposing.value = false // 始终重置组合态标记，避免暂停后卡在组合态
  if (paused.value) return // 输入已暂停：不同步给电脑
  const cur = e.target.value
  handleDiff(lastValue.value, cur)
  lastValue.value = cur
}

/** keydown：处理 Enter / 空值 Backspace（其余由 input diff 处理） */
function onKeydown(e) {
  if (paused.value) return // 输入已暂停：不拦截、不发 WS
  // 组合态按键交给输入法，不拦截
  if (isComposing.value) return
  if (e.key === 'Enter') {
    e.preventDefault()
    sendKey('Enter')
    return
  }
  // input 已为空时按 Backspace，input 事件不会触发，这里补发
  if (e.key === 'Backspace' && e.target.value === '') {
    sendKey('Backspace')
  }
}

onMounted(() => {
  // 自动聚焦唤起键盘（nextTick 确保 DOM 就绪）
  nextTick(() => inputRef.value?.focus({ preventScroll: true }))
})
</script>

<template>
  <div
    class="kb-panel"
    :class="{ 'is-paused': paused }"
  >
    <!-- 顶部状态栏 -->
    <div class="kb-bar">
      <span class="kb-tip">{{ paused ? '已暂停' : '实时输入中' }}</span>
      <button
        class="kb-pause"
        :class="{ 'is-paused': paused }"
        @click="togglePause"
      >
        {{ paused ? '继续' : '暂停' }}
      </button>
      <button
        class="kb-close"
        @click="emit('close')"
      >
        收起
      </button>
    </div>
    <p
      v-if="!paused"
      class="kb-hint"
    >
      请确保电脑当前输入框已获得光标
    </p>
    <p
      v-else
      class="kb-hint kb-hint-paused"
    >
      实时输入已暂停，点击"继续"恢复同步
    </p>
    <!-- 输入框：可见可聚焦，用于唤起虚拟键盘 -->
    <input
      ref="inputRef"
      class="kb-input"
      type="text"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      placeholder="在此输入..."
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @keydown="onKeydown"
    >
  </div>
</template>

<style scoped>
.kb-panel {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
  padding: 10px;
  gap: 8px;
  z-index: 30;
}
/* 暂停态：橙色边框提示，整体视觉弱化 */
.kb-panel.is-paused {
  background: #f3f4f6;
  box-shadow: inset 0 0 0 2px #f59e0b;
}
.kb-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 40px;
}
.kb-tip {
  font-size: 15px;
  font-weight: 600;
}
.kb-pause {
  margin-left: auto;
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  -webkit-tap-highlight-color: transparent;
}
/* 暂停时"继续"按钮醒目（橙色实心） */
.kb-pause.is-paused {
  background: #f59e0b;
  color: #fff;
  border-color: #f59e0b;
  font-weight: 600;
}
.kb-close {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
}
.kb-hint {
  font-size: 12px;
  color: #6b7280;
}
.kb-hint-paused {
  color: #f59e0b;
  font-weight: 600;
}
.kb-input {
  flex: 1;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  font-size: 18px;
  background: #fff;
  outline: none;
  min-height: 56px;
}
</style>
