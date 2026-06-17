<!--
  预留功能入口面板（PRD 8.8）

  第一版只做界面入口，置灰不可点击，标注"敬请期待"。
  这些功能在 V1 不实现真实能力（PRD 第14节开发边界明确排除）。
-->
<script setup>
const emit = defineEmits(['close'])

// 预留功能清单（PRD 8.8 + 11.3），均置灰不可用
const reservedFeatures = [
  { label: '蓝牙连接', desc: '通过蓝牙直连' },
  { label: '服务器中转', desc: '跨网络中转连接' },
  { label: 'PPT 模式', desc: '演示控制' },
  { label: '媒体模式', desc: '音乐/视频控制' },
  { label: '手写输入', desc: '手写识别上屏' },
  { label: '语音输入', desc: '语音识别上屏' },
  { label: '多设备控制', desc: '同时控制多台电脑' },
  { label: '账号登录', desc: '云端同步配置' },
  { label: '跨公网远程', desc: '远程桌面控制' }
]
</script>

<template>
  <div
    class="scrim"
    @click.self="emit('close')"
  >
    <div class="rp-panel">
      <div class="rp-bar">
        <span class="rp-title">更多功能</span>
        <button
          class="rp-close"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>
      <p class="rp-hint">
        以下功能敬请期待，将在后续版本推出
      </p>
      <div class="rp-grid">
        <div
          v-for="item in reservedFeatures"
          :key="item.label"
          class="rp-item"
        >
          <span class="rp-item-label">{{ item.label }}</span>
          <span class="rp-item-desc">{{ item.desc }}</span>
          <span class="rp-item-badge">敬请期待</span>
        </div>
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

.rp-panel {
  width: 100%;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 12px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
}

.rp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.rp-title {
  font-size: 16px;
  font-weight: 600;
}

.rp-close {
  padding: 6px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #f9fafb;
  font-size: 14px;
}

.rp-hint {
  font-size: 12px;
  color: #9ca3af;
  margin: 0 0 10px;
}

.rp-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

/* 置灰不可点击项 */
.rp-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 10px;
  background: #f9fafb;
  opacity: 0.55;
  pointer-events: none;
}

.rp-item-label {
  font-size: 15px;
  font-weight: 600;
  color: #6b7280;
}

.rp-item-desc {
  font-size: 11px;
  color: #9ca3af;
}

.rp-item-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  color: #d1d5db;
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
