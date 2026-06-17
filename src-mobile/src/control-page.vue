<!--
  主控制页（PRD 8.1 ~ 9.4）

  布局：
    ┌───────────────────────────┐
    │ 左键按钮        右键按钮     │  顶部按钮区（8.2）
    ├──────────────────┬────────┤
    │   主触控区        │ 竖向滚动 │  中部（8.3 / 8.4）
    ├──────────────────┴────────┤
    │       底部横向滚动区         │  （8.5）
    ├───────────────────────────┤
    │ 键盘  快捷键  设置  断开     │  工具栏（8.7）
    └───────────────────────────┘

  手势接入：触控区 → gestureRecognizer → control-events → wsClient.send
  高频 mouse_move 用时间戳节流（~60fps）。
-->
<script setup>
import { ref, onUnmounted } from 'vue'
import {
  MouseButton,
  GestureType,
  EdgeDirection
} from '@shared/protocol.js'
import { DEFAULT_SETTINGS } from '@shared/constants.js'
import { createGestureRecognizer } from './gestures.js'
import {
  moveMessage,
  clickMessage,
  downMessage,
  upMessage,
  scrollMessage,
  gestureMessage,
  edgeMoveStartMessage,
  edgeMoveStopMessage
} from './control-events.js'
import KeyboardPanel from './keyboard-panel.vue'
import ShortcutPanel from './shortcut-panel.vue'

const props = defineProps({
  // ws-client 实例
  wsClient: { type: Object, required: true }
})
const emit = defineEmits(['disconnect', 'settings'])

// ===== 设置（灵敏度等；后续设置板块接入后改为响应式同步） =====
const settings = ref({ ...DEFAULT_SETTINGS })

/** 灵敏度档位 → 倍率 */
function sensFactor(level) {
  return { low: 0.6, medium: 1, high: 1.6 }[level] || 1
}

// 滚动基础放大：手指 1px ≈ 滚轮 N 单位（鼠标滚轮一格约 100~120）
const SCROLL_BASE = 6

// ===== 面板显示状态 =====
const showKeyboard = ref(false)
const showShortcut = ref(false)

// ===== 主触控区元素引用（用于边缘检测取尺寸） =====
const padRef = ref(null)

// ===== mouse_move 节流（~60fps） =====
let lastMoveTs = 0
const MOVE_THROTTLE = 16 // ms

// ===== 左键按钮拖拽（方式二）：按住左键按钮 + 触控区滑动 =====
const LEFT_BTN_LONG = 300 // 左键按钮短按/长按分界
let leftBtnTimer = null
let leftBtnLong = false // 是否已进入长按（已发 down）

// ===== 边缘持续移动（PRD 9.4） =====
const EDGE_THRESHOLD = 8 // 距边缘 px
const EDGE_DELAY = 300 // 停留触发 ms
let edgeTimer = null
let edgeDir = null // 当前停留的边缘方向
let edgeActive = false // 是否已发出 edge_move_start

/** 发送鼠标移动（带灵敏度 + 节流） */
function sendMove(dx, dy, speed) {
  const now = performance.now()
  if (now - lastMoveTs < MOVE_THROTTLE) return
  lastMoveTs = now
  const f = sensFactor(settings.value.mouseSensitivity)
  props.wsClient.send(
    moveMessage(Math.round(dx * f), Math.round(dy * f), speed)
  )
}

// ===== 手势识别器：把语义手势翻译成协议消息 =====
const recognizer = createGestureRecognizer({
  // 单指点击 → 左键单击
  onTap: () => props.wsClient.send(clickMessage(MouseButton.LEFT)),
  // 单指双击 → 左键双击
  onDoubleTap: () => props.wsClient.send(clickMessage(MouseButton.LEFT, 2)),
  // 单指移动 → 鼠标移动（节流）
  onMove: (dx, dy, speed) => sendMove(dx, dy, speed),
  // 长按触发 → 鼠标按下（拖拽方式一）
  onLongPress: () => props.wsClient.send(downMessage(MouseButton.LEFT)),
  // 长按后拖动 → 鼠标移动
  onDrag: (dx, dy) => sendMove(dx, dy, 0),
  // 长按拖拽结束 → 鼠标松开
  onDragEnd: () => props.wsClient.send(upMessage(MouseButton.LEFT)),
  // 双指点击 → 右键
  onTwoFingerTap: () => props.wsClient.send(clickMessage(MouseButton.RIGHT)),
  // 双指水平滑动 → 前进/后退（电脑端翻译为 Alt+Left/Right）
  onTwoFingerSwipe: (dir) => {
    const g = dir === 'right' ? GestureType.TWO_FINGER_SWIPE_RIGHT : GestureType.TWO_FINGER_SWIPE_LEFT
    props.wsClient.send(gestureMessage(g))
  },
  // 三指滑动 → 任务切换 / 回桌面
  onThreeFingerSwipe: (dir) => {
    const map = {
      left: GestureType.THREE_FINGER_SWIPE_LEFT,
      right: GestureType.THREE_FINGER_SWIPE_RIGHT,
      up: GestureType.THREE_FINGER_SWIPE_UP
    }
    props.wsClient.send(gestureMessage(map[dir]))
  }
}, settings.value)

// ===== 工具函数：TouchList → 简化点集 =====
function toPoints(touchList) {
  const arr = []
  for (let i = 0; i < touchList.length; i++) {
    const t = touchList[i]
    arr.push({ identifier: t.identifier, clientX: t.clientX, clientY: t.clientY })
  }
  return arr
}

// ===== 主触控区事件 =====
function onPadStart(e) {
  e.preventDefault()
  recognizer.onTouchStart(toPoints(e.changedTouches))
}

function onPadMove(e) {
  e.preventDefault()
  recognizer.onTouchMove(toPoints(e.changedTouches))
  // 边缘持续移动检测（仅单指）
  if (e.touches.length === 1 && padRef.value) {
    const rect = padRef.value.getBoundingClientRect()
    handleEdge(e.touches[0].clientX, e.touches[0].clientY, rect)
  }
}

function onPadEnd(e) {
  e.preventDefault()
  recognizer.onTouchEnd(toPoints(e.changedTouches))
  // 手指全部离开 → 停止边缘持续移动
  if (e.touches.length === 0) clearEdge()
}

// ===== 左键按钮（方式二拖拽入口） =====
function onLeftBtnStart(e) {
  e.preventDefault()
  leftBtnLong = false
  clearTimeout(leftBtnTimer)
  // 短按视为点击，长按（按住）发 down 进入拖拽态
  leftBtnTimer = setTimeout(() => {
    leftBtnLong = true
    props.wsClient.send(downMessage(MouseButton.LEFT))
  }, LEFT_BTN_LONG)
}

function onLeftBtnEnd(e) {
  e.preventDefault()
  clearTimeout(leftBtnTimer)
  if (leftBtnLong) {
    // 长按松开 → 发 up
    props.wsClient.send(upMessage(MouseButton.LEFT))
    leftBtnLong = false
  } else {
    // 短按 → 左键单击
    props.wsClient.send(clickMessage(MouseButton.LEFT))
  }
}

// ===== 右键按钮 =====
function onRightBtnEnd(e) {
  e.preventDefault()
  props.wsClient.send(clickMessage(MouseButton.RIGHT))
}

// ===== 右侧竖向滚动区（PRD 8.4） =====
let vLastY = 0
function onVScrollStart(e) {
  e.preventDefault()
  if (e.changedTouches.length) vLastY = e.changedTouches[0].clientY
}
function onVScrollMove(e) {
  e.preventDefault()
  if (!e.changedTouches.length) return
  const y = e.changedTouches[0].clientY
  const dy = y - vLastY
  vLastY = y
  const f = sensFactor(settings.value.verticalScrollSensitivity)
  props.wsClient.send(scrollMessage(0, Math.round(dy * SCROLL_BASE * f)))
}

// ===== 底部横向滚动区（PRD 8.5） =====
let hLastX = 0
function onHScrollStart(e) {
  e.preventDefault()
  if (e.changedTouches.length) hLastX = e.changedTouches[0].clientX
}
function onHScrollMove(e) {
  e.preventDefault()
  if (!e.changedTouches.length) return
  const x = e.changedTouches[0].clientX
  const dx = x - hLastX
  hLastX = x
  const f = sensFactor(settings.value.horizontalScrollSensitivity)
  props.wsClient.send(scrollMessage(Math.round(dx * SCROLL_BASE * f), 0))
}

// ===== 边缘持续移动（PRD 9.4） =====
/**
 * 取触点所处边缘方向（距边 < EDGE_THRESHOLD），不在边缘返回 null
 * 四角取最近的一边
 */
function getEdgeDir(x, y, rect) {
  const dl = x - rect.left
  const dr = rect.right - x
  const dt = y - rect.top
  const db = rect.bottom - y
  const min = Math.min(dl, dr, dt, db)
  if (min > EDGE_THRESHOLD) return null
  if (min === dl) return EdgeDirection.LEFT
  if (min === dr) return EdgeDirection.RIGHT
  if (min === dt) return EdgeDirection.UP
  return EdgeDirection.DOWN
}

/** 处理边缘停留：进入边缘延迟发 start；切换/离开则停止 */
function handleEdge(x, y, rect) {
  const dir = getEdgeDir(x, y, rect)
  if (dir) {
    if (dir !== edgeDir) {
      // 切换到新边缘：先停旧的
      clearEdge()
      edgeDir = dir
      edgeTimer = setTimeout(() => {
        edgeActive = true
        const speed = sensFactor(settings.value.edgeMoveSpeed)
        props.wsClient.send(edgeMoveStartMessage(dir, speed))
      }, EDGE_DELAY)
    }
    // 同方向停留：保持
  } else {
    // 离开边缘
    clearEdge()
  }
}

/** 清除边缘定时器并发出 stop（若曾激活） */
function clearEdge() {
  if (edgeTimer) { clearTimeout(edgeTimer); edgeTimer = null }
  if (edgeActive) {
    props.wsClient.send(edgeMoveStopMessage())
    edgeActive = false
  }
  edgeDir = null
}

// ===== 工具栏 =====
function onDisconnect() {
  props.wsClient.close()
  emit('disconnect')
}

onUnmounted(() => {
  clearTimeout(leftBtnTimer)
  clearEdge()
})
</script>

<template>
  <div class="ctrl">
    <!-- 顶部：左右键按钮区 -->
    <div class="button-row">
      <button
        class="btn-mouse"
        @touchstart="onLeftBtnStart"
        @touchend="onLeftBtnEnd"
        @contextmenu.prevent
      >
        左键
      </button>
      <button
        class="btn-mouse"
        @touchend="onRightBtnEnd"
        @contextmenu.prevent
      >
        右键
      </button>
    </div>

    <!-- 中部：主触控区 + 右侧竖向滚动区 -->
    <div class="middle-row">
      <div
        ref="padRef"
        class="touchpad"
        @touchstart="onPadStart"
        @touchmove="onPadMove"
        @touchend="onPadEnd"
        @touchcancel="onPadEnd"
      />
      <div
        class="scroll-vertical"
        @touchstart="onVScrollStart"
        @touchmove="onVScrollMove"
        @touchend="onVScrollStart"
        @touchcancel="onVScrollStart"
      />
    </div>

    <!-- 底部横向滚动区 -->
    <div
      class="scroll-horizontal"
      @touchstart="onHScrollStart"
      @touchmove="onHScrollMove"
      @touchend="onHScrollStart"
      @touchcancel="onHScrollStart"
    />

    <!-- 底部工具栏 -->
    <div class="toolbar">
      <button
        class="tool-btn"
        @click="showKeyboard = true"
      >
        键盘
      </button>
      <button
        class="tool-btn"
        @click="showShortcut = true"
      >
        快捷键
      </button>
      <button
        class="tool-btn"
        @click="emit('settings')"
      >
        设置
      </button>
      <button
        class="tool-btn danger"
        @click="onDisconnect"
      >
        断开
      </button>
    </div>

    <!-- 实时键盘输入面板（覆盖层） -->
    <KeyboardPanel
      v-if="showKeyboard"
      :ws-client="wsClient"
      @close="showKeyboard = false"
    />
    <!-- 快捷键面板（覆盖层） -->
    <ShortcutPanel
      v-if="showShortcut"
      :ws-client="wsClient"
      @close="showShortcut = false"
    />
  </div>
</template>

<style scoped>
.ctrl {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  /* 触控目标参考 */
  user-select: none;
  -webkit-user-select: none;
}

/* 顶部按钮区 */
.button-row {
  display: flex;
  gap: 8px;
  height: 60px;
}
.btn-mouse {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 16px;
  background: #f9fafb;
  /* 禁止默认触摸行为：滚动 / 缩放 / 高亮 */
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.btn-mouse:active {
  background: #e5e7eb;
}

/* 中部 */
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
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}
.scroll-vertical {
  width: 52px;
  background: #f3f4f6;
  border-radius: 10px;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

/* 底部横向滚动 */
.scroll-horizontal {
  height: 44px;
  background: #f3f4f6;
  border-radius: 10px;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

/* 工具栏 */
.toolbar {
  display: flex;
  gap: 6px;
  height: 56px;
}
.tool-btn {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 14px;
  background: #fff;
  -webkit-tap-highlight-color: transparent;
}
.tool-btn:active {
  background: #f3f4f6;
}
.tool-btn.danger {
  color: #dc2626;
  border-color: #fecaca;
}
</style>
