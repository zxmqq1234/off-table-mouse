<!--
  桌外鼠标 - 手机网页端主应用（骨架）

  包含两个视图：
  1. 连接页：解析 URL Token、请求连接、显示连接状态
  2. 主控制页：鼠标按钮区、主触控区、滚动区、工具栏

  当前为布局占位，后续逐步实现手势识别、WebSocket 通信、实时键盘输入等。
-->
<script setup>
import { ref } from 'vue'

// 当前视图：connecting（连接中）| control（主控制）
const view = ref('connecting')

// 连接状态文案
const connectStatus = ref('正在连接...')

// 临时入口：点击进入控制页（后续由 WebSocket 连接成功后自动切换）
function enterControl() {
  view.value = 'control'
}
</script>

<template>
  <div class="app">
    <!-- 连接页 -->
    <div
      v-if="view === 'connecting'"
      class="page-connect"
    >
      <h1 class="title">
        桌外鼠标
      </h1>
      <p class="status">
        {{ connectStatus }}
      </p>
      <!-- 占位按钮：后续由 WebSocket 自动控制 -->
      <button
        class="btn-debug"
        @click="enterControl"
      >
        进入控制（测试）
      </button>
    </div>

    <!-- 主控制页 -->
    <div
      v-else
      class="page-control"
    >
      <!-- 顶部：左右键按钮区 -->
      <div class="button-row">
        <button class="btn-mouse left">
          左键
        </button>
        <button class="btn-mouse right">
          右键
        </button>
      </div>

      <!-- 中部：主触控区 + 右侧竖向滚动区 -->
      <div class="middle-row">
        <div class="touchpad">
          主触控区
        </div>
        <div class="scroll-vertical">
          滚动
        </div>
      </div>

      <!-- 底部横向滚动区 -->
      <div class="scroll-horizontal">
        横向滚动
      </div>

      <!-- 底部工具栏 -->
      <div class="toolbar">
        <button class="tool-btn">
          键盘
        </button>
        <button class="tool-btn">
          快捷键
        </button>
        <button class="tool-btn">
          设置
        </button>
        <button class="tool-btn danger">
          断开
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  overflow: hidden;
}

/* ===== 连接页 ===== */
.page-connect {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
}

.title {
  font-size: 28px;
  font-weight: 700;
}

.status {
  font-size: 15px;
  color: #6b7280;
}

.btn-debug {
  padding: 10px 24px;
  font-size: 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
}

/* ===== 主控制页 ===== */
.page-control {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.button-row {
  display: flex;
  gap: 8px;
  height: 56px;
}

.btn-mouse {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 15px;
  background: #f9fafb;
}

.middle-row {
  flex: 1;
  display: flex;
  gap: 4px;
  min-height: 0;
}

.touchpad {
  flex: 1;
  background: #f3f4f6;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
  /* 禁止默认触摸行为，后续由 touch 事件接管 */
  touch-action: none;
}

.scroll-vertical {
  width: 48px;
  background: #f3f4f6;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 12px;
  writing-mode: vertical-rl;
  touch-action: none;
}

.scroll-horizontal {
  height: 40px;
  background: #f3f4f6;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 12px;
  touch-action: none;
}

.toolbar {
  display: flex;
  gap: 6px;
  height: 52px;
}

.tool-btn {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 13px;
  background: #fff;
}

.tool-btn.danger {
  color: #dc2626;
  border-color: #fecaca;
}
</style>
