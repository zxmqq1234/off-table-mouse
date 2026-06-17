/**
 * 触控区手势识别器（纯逻辑，不含 DOM，便于单测）
 *
 * 基于 W3C Touch Events，由组件层把 touchstart/touchmove/touchend 的
 * changedTouches 喂进来，识别器维护多指状态机并回调语义手势。
 *
 * 支持的手势（对应 PRD 第9节）：
 * - 单指：点击 / 双击 / 移动 / 长按 / 长按后拖拽
 * - 双指：双指点击（右键）/ 双指长按（右键）/ 水平滑动（前进后退）
 * - 三指：轻点（中键）/ 水平滑动（切换窗口）/ 垂直上滑（多任务）/ 垂直下滑（显示桌面）
 *
 * 多指追踪：用 touch.identifier 区分手指，维护 touches Map。
 */

// ===== 识别阈值（手机端内部常量，不在 settings 内） =====
// 点击允许的最大位移（px），超过视为滑动而非点击
const TAP_MOVE_THRESHOLD = 10
// 滑动方向判定的最小位移（px）
const SWIPE_DISTANCE_THRESHOLD = 40

/**
 * 计算若干触点的质心坐标
 * @param {Array<{x:number,y:number}>} points
 * @returns {{x:number,y:number}}
 */
function centroid(points) {
  if (!points.length) return { x: 0, y: 0 }
  let sx = 0, sy = 0
  for (const p of points) { sx += p.x; sy += p.y }
  return { x: sx / points.length, y: sy / points.length }
}

/**
 * 创建手势识别器
 * @param {object} callbacks 回调集合
 * @param {(dx:number,dy:number)=>void} [callbacks.onTap] 单指点击
 * @param {()=>void} [callbacks.onDoubleTap] 单指双击
 * @param {(dx:number,dy:number,speed:number)=>void} [callbacks.onMove] 单指移动
 * @param {()=>void} [callbacks.onLongPress] 长按触发（进入拖拽态）
 * @param {(dx:number,dy:number)=>void} [callbacks.onDrag] 长按后的拖拽移动
 * @param {()=>void} [callbacks.onDragEnd] 长按拖拽结束（手指抬起，组件据此发 mouse_up）
 * @param {()=>void} [callbacks.onTwoFingerTap] 双指点击（右键）
 * @param {()=>void} [callbacks.onTwoFingerLongPress] 双指长按（右键；双指落下静止超过 longPressThreshold 触发）
 * @param {(dir:'left'|'right')=>void} [callbacks.onTwoFingerSwipe] 双指水平滑动
 * @param {(dir:'left'|'right'|'up')=>void} [callbacks.onThreeFingerSwipe] 三指滑动
 * @param {()=>void} [callbacks.onThreeFingerTap] 三指轻点（中键）
 * @param {object} [settings] 灵敏度 / 阈值设置（见 constants.DEFAULT_SETTINGS）
 */
export function createGestureRecognizer(callbacks = {}, settings = {}) {
  const cb = callbacks

  // 当前可变设置（updateSettings 更新）
  let cfg = {
    clickThreshold: 200,
    longPressThreshold: 500,
    doubleClickInterval: 300,
    enableTwoFingerGesture: true,
    enableThreeFingerGesture: true,
    enableDrag: true,
    ...settings
  }

  // 多指触点状态：identifier -> { x, y, startX, startY, startTime, lastX, lastY, lastTime, moved }
  const touches = new Map()
  // 长按定时器句柄
  let longPressTimer = null
  // 是否已进入长按拖拽态
  let longPressActive = false
  // 双指长按定时器句柄（与单指长按独立，避免相互干扰）
  let twoFingerLongPressTimer = null
  // 上一次单指 tap 时间戳（双击判定）
  let lastTapTime = 0
  // 多指手势起始质心 { count, x, y, time }；为 null 表示当前无多指会话
  let multiStart = null
  // 多指手势是否已判定（一次会话只判一次）
  let gestureDecided = false

  /** 安全回调 */
  const fire = (fn, ...args) => { try { cb[fn]?.(...args) } catch (e) { console.error('[gesture] 回调异常:', e) } }

  /** 清除长按定时器 */
  function clearLongPressTimer() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  }

  /** 清除双指长按定时器 */
  function clearTwoFingerLongPressTimer() {
    if (twoFingerLongPressTimer) { clearTimeout(twoFingerLongPressTimer); twoFingerLongPressTimer = null }
  }

  /** 重置所有状态（手指全部离开时调用） */
  function reset() {
    touches.clear()
    clearLongPressTimer()
    clearTwoFingerLongPressTimer()
    longPressActive = false
    multiStart = null
    gestureDecided = false
    // 注意：lastTapTime 不清空，保留以支持连续两次单指 tap 构成双击
  }

  /** 更新设置（运行时切换灵敏度 / 开关） */
  function updateSettings(next = {}) {
    cfg = { ...cfg, ...next }
  }

  /**
   * touchstart 处理：登记新触点，并按当前手指数进入对应模式
   * @param {Array<{identifier:number,clientX:number,clientY:number}>} changedTouches
   */
  function onTouchStart(changedTouches) {
    const now = Date.now()
    for (const t of changedTouches) {
      touches.set(t.identifier, {
        x: t.clientX, y: t.clientY,
        startX: t.clientX, startY: t.clientY,
        startTime: now,
        lastX: t.clientX, lastY: t.clientY,
        lastTime: now,
        moved: false
      })
    }

    const count = touches.size
    const c = centroid([...touches.values()])

    if (count === 1) {
      // 单指落下：启动长按定时器（启用拖拽时才有意义）
      if (cfg.enableDrag) {
        clearLongPressTimer()
        longPressTimer = setTimeout(() => {
          // 期间未移动且仍为单指 → 触发长按，进入拖拽态
          if (touches.size === 1 && !longPressActive) {
            longPressActive = true
            fire('onLongPress')
          }
        }, cfg.longPressThreshold)
      }
    } else if (count === 2) {
      // 进入双指：取消单指长按
      clearLongPressTimer()
      longPressActive = false
      if (cfg.enableTwoFingerGesture && !multiStart) {
        multiStart = { count: 2, x: c.x, y: c.y, time: now }
        gestureDecided = false
        // 启动双指长按定时器：双指落下后静止超过阈值 → 双指长按（右键）
        clearTwoFingerLongPressTimer()
        twoFingerLongPressTimer = setTimeout(() => {
          twoFingerLongPressTimer = null
          // 仍为双指且本次会话未判定 → 触发双指长按
          if (touches.size === 2 && multiStart && !gestureDecided) {
            fire('onTwoFingerLongPress')
            gestureDecided = true // 互斥：本次会话不再判定 swipe/tap
          }
        }, cfg.longPressThreshold)
      }
    } else if (count === 3) {
      // 进入三指：取消单指长按，以三指质心作为滑动基准
      clearLongPressTimer()
      longPressActive = false
      if (cfg.enableThreeFingerGesture) {
        multiStart = { count: 3, x: c.x, y: c.y, time: now }
        gestureDecided = false
      }
    }
  }

  /**
   * touchmove 处理：更新触点，分发单指移动 / 拖拽
   * @param {Array<{identifier:number,clientX:number,clientY:number}>} changedTouches
   */
  function onTouchMove(changedTouches) {
    const now = Date.now()
    for (const t of changedTouches) {
      const p = touches.get(t.identifier)
      if (!p) continue
      // 本次 move 增量（相对上一次 move）
      const dx = t.clientX - p.lastX
      const dy = t.clientY - p.lastY
      const dt = now - p.lastTime
      // 更新最新位置 / 时间
      p.x = t.clientX
      p.y = t.clientY
      p.lastX = t.clientX
      p.lastY = t.clientY
      p.lastTime = now
      // 累计位移判定是否移动过
      const totalDist = Math.hypot(t.clientX - p.startX, t.clientY - p.startY)
      if (totalDist > TAP_MOVE_THRESHOLD) p.moved = true

      // 双指会话期间：任一手指明显移动 → 取消双指长按等待（改判 swipe/tap）
      if (multiStart && multiStart.count === 2 && p.moved) {
        clearTwoFingerLongPressTimer()
      }

      // 仅单指会话（无多指）才分发移动 / 拖拽
      if (multiStart === null && touches.size === 1) {
        if (longPressActive) {
          // 长按后的移动 → 拖拽
          fire('onDrag', dx, dy)
        } else {
          // 普通移动：一旦移动即取消长按等待
          if (p.moved) clearLongPressTimer()
          const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0
          fire('onMove', dx, dy, speed)
        }
      }
    }
  }

  /**
   * 判定多指手势方向（在 touchend 第一次触发且处于多指会话时）
   * @returns {boolean} 是否完成了判定
   */
  function decideMultiGesture() {
    if (!multiStart || gestureDecided) return false
    const c = centroid([...touches.values()])
    const dx = c.x - multiStart.x
    const dy = c.y - multiStart.y
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    const start = multiStart

    if (start.count === 2) {
      // 双指：水平滑动 → 前进 / 后退；否则短时小位移 → 双指点击（右键）
      if (adx >= SWIPE_DISTANCE_THRESHOLD && adx > ady) {
        fire('onTwoFingerSwipe', dx > 0 ? 'right' : 'left')
      } else if (adx < TAP_MOVE_THRESHOLD && ady < TAP_MOVE_THRESHOLD) {
        fire('onTwoFingerTap')
      }
      gestureDecided = true
      return true
    }

    if (start.count === 3) {
      // 三指：水平 → 切换窗口；垂直上滑 → 多任务视图；垂直下滑 → 显示桌面；短时小位移 → 三指轻点（中键）
      if (adx >= SWIPE_DISTANCE_THRESHOLD && adx > ady) {
        fire('onThreeFingerSwipe', dx > 0 ? 'right' : 'left')
        gestureDecided = true
        return true
      }
      if (ady >= SWIPE_DISTANCE_THRESHOLD && ady > adx) {
        // dy<0 上滑 → 多任务；dy>0 下滑 → 显示桌面
        fire('onThreeFingerSwipe', dy < 0 ? 'up' : 'down')
        gestureDecided = true
        return true
      }
      // 三指轻点：位移小且时间短（在 onTouchEnd 首指离开时判定）
      if (adx < TAP_MOVE_THRESHOLD && ady < TAP_MOVE_THRESHOLD) {
        const elapsed = Date.now() - start.time
        if (elapsed < cfg.clickThreshold) {
          fire('onThreeFingerTap')
          gestureDecided = true
          return true
        }
      }
    }
    return false
  }

  /**
   * touchend 处理：判定点击 / 拖拽结束 / 多指手势
   * @param {Array<{identifier:number,clientX:number,clientY:number}>} changedTouches
   */
  function onTouchEnd(changedTouches) {
    const now = Date.now()

    // 先用即将离开的触点更新最终位置（用于质心判定）
    for (const t of changedTouches) {
      const p = touches.get(t.identifier)
      if (p) {
        p.x = t.clientX
        p.y = t.clientY
        const totalDist = Math.hypot(t.clientX - p.startX, t.clientY - p.startY)
        if (totalDist > TAP_MOVE_THRESHOLD) p.moved = true
      }
    }

    // 多指会话：在第一次手指离开时判定手势方向
    if (multiStart) {
      // 双指会话中手指提前离开 → 取消双指长按等待（长按要求两指持续按住）
      if (multiStart.count === 2) clearTwoFingerLongPressTimer()
      decideMultiGesture()
    }

    // 单指会话收尾：仅当无多指会话（纯单指）时判定点击 / 拖拽结束
    // 注意：先判定是否"最后一指即将离开"
    const willBeEmpty = touches.size === changedTouches.length && multiStart === null
    if (willBeEmpty) {
      const only = [...touches.values()][0]
      if (only) {
        if (longPressActive) {
          // 长按拖拽结束
          fire('onDragEnd')
        } else {
          const duration = now - only.startTime
          // 点击条件：时间短 + 位移小
          if (!only.moved && duration < cfg.clickThreshold) {
            // 双击判定：与上一次 tap 间隔小于阈值
            if (now - lastTapTime < cfg.doubleClickInterval) {
              fire('onDoubleTap')
              lastTapTime = 0 // 重置，避免三击误判为双击
            } else {
              fire('onTap', only.x - only.startX, only.y - only.startY)
              lastTapTime = now
            }
          }
        }
      }
    }

    // 移除已离开的触点
    for (const t of changedTouches) touches.delete(t.identifier)

    // 全部手指离开 → 重置状态机
    if (touches.size === 0) reset()
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    updateSettings,
    reset,
    // 调试 / 状态查询
    getFingerCount: () => touches.size
  }
}
