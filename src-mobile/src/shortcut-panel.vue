<!--
  快捷键面板（PRD 8.7）

  网格按钮，点击发送 shortcut 事件。
  P0：复制 / 粘贴 / 回车 / 退出 / 删除 / 桌面
  P1：剪切 / 撤销 / 全选 / Delete / Tab / 任务切换
  keys 数组对应 protocol SHORTCUT payload（电脑端按下顺序触发）。
-->
<script setup>
import { shortcutMessage } from './control-events'

const props = defineProps({
  wsClient: { type: Object, default: null }
})
const emit = defineEmits(['close'])

// 快捷键定义：label 按钮文案，keys 协议按键数组，p 优先级（仅用于排序/样式）
const shortcuts = [
  { label: '复制', keys: ['Ctrl', 'C'], p: 0 },
  { label: '粘贴', keys: ['Ctrl', 'V'], p: 0 },
  { label: '回车', keys: ['Enter'], p: 0 },
  { label: '退出', keys: ['Esc'], p: 0 },
  { label: '删除', keys: ['Backspace'], p: 0 },
  { label: '桌面', keys: ['Win', 'D'], p: 0 },
  { label: '剪切', keys: ['Ctrl', 'X'], p: 1 },
  { label: '撤销', keys: ['Ctrl', 'Z'], p: 1 },
  { label: '全选', keys: ['Ctrl', 'A'], p: 1 },
  { label: 'Delete', keys: ['Delete'], p: 1 },
  { label: 'Tab', keys: ['Tab'], p: 1 },
  { label: '任务切换', keys: ['Alt', 'Tab'], p: 1 }
]

/** 点击按钮：发送快捷键组合 */
function send(item) {
  props.wsClient?.send(shortcutMessage(item.keys))
}
</script>

<template>
  <div
    class="scrim"
    @click.self="emit('close')"
  >
    <div class="sc-panel">
      <div class="sc-bar">
        <span class="sc-title">快捷键</span>
        <button
          class="sc-close"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>
      <div class="sc-grid">
        <button
          v-for="item in shortcuts"
          :key="item.label"
          class="sc-btn"
          :class="{ p1: item.p === 1 }"
          @click="send(item)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scrim {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  z-index: 40;
}
.sc-panel {
  width: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}
.sc-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sc-title {
  font-size: 16px;
  font-weight: 600;
}
.sc-close {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
}
.sc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.sc-btn {
  height: 56px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  font-size: 16px;
  /* 触控目标 ≥44px */
  min-height: 56px;
}
.sc-btn.p1 {
  background: #fff;
  color: #4b5563;
}
.sc-btn:active {
  background: #e5e7eb;
}
</style>
