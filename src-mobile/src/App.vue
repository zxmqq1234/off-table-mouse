<!--
  桌外鼠标 - 手机网页端主应用

  组装两个视图：
  1. 连接页：解析 URL Token、请求连接、显示连接状态
  2. 主控制页：接收 wsClient 实例，发送控制事件

  视图切换：连接成功 → 控制；断开 → 回连接页。
-->
<script setup>
import { ref } from 'vue'
import ConnectPage from './connect-page.vue'
import ControlPage from './control-page.vue'

// 当前视图：connect（连接页）| control（主控制页）
const view = ref('connect')
// ws-client 实例（连接成功后由连接页产出，传给控制页）
const wsClient = ref(null)

/** 连接页产出 client 且已获批准 → 进入控制页 */
function onConnected(client) {
  wsClient.value = client
  view.value = 'control'
}

/** 控制页主动断开 → 回到连接页（重新走连接流程） */
function onDisconnect() {
  wsClient.value = null
  view.value = 'connect'
}

/** 设置入口（占位，后续设置板块实现） */
function onSettings() {
  // TODO: 板块E 接入设置面板
  console.log('[App] 打开设置（占位）')
}
</script>

<template>
  <div class="app">
    <ConnectPage
      v-if="view === 'connect'"
      @connected="onConnected"
    />
    <ControlPage
      v-else
      :ws-client="wsClient"
      @disconnect="onDisconnect"
      @settings="onSettings"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh; /* 适配 iOS Safari 动态视口 */
  width: 100vw;
  overflow: hidden;
}
</style>
