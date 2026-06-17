/**
 * 鼠标控制器（业务逻辑层）
 *
 * 职责：包装 adapter 的鼠标操作，加入业务计算与状态管理：
 *  - mouse_move：根据 payload 的 dx/dy/speed，计算【加速度倍率】，再交由 adapter 执行
 *    （adapter 内部再乘灵敏度，互不重复）。
 *  - mouse_click：button + clicks（双击支持）。
 *  - mouse_down / mouse_up：拖拽流程的按下/松开。
 *  - mouse_scroll：对 deltaX/deltaY 应用【滚动灵敏度】后交由 adapter。
 *  - edge_move_start / edge_move_stop：边缘持续移动，用定时器按方向周期性 moveMouse，
 *    必须能正确清理，避免内存泄漏。
 *
 * 计算约定（最终鼠标位移）：
 *   最终 dx = 原始 dx × 加速度(controller) × 灵敏度(adapter)
 *   - 加速度：仅当 settings.mouseAcceleration 开启且 payload.speed > 1.5 时生效
 *   - 灵敏度：由 adapter 内部应用（controller 只负责 setMouseSensitivity）
 *
 * 对接契约：
 *   入参 message/payload 结构严格遵循 shared/protocol.js 的 EventType.MOUSE_*。
 */

const { EventType, EdgeDirection } = require('../../shared/protocol')

// 旧灵敏度档位 → 倍率（向后兼容已保存的旧 settings.json）
const LEGACY_SENSITIVITY = { low: 0.6, medium: 1.0, high: 1.6 }

// 边缘持续移动：定时器间隔(ms)，固定 16ms ≈ 60fps 保证顺滑
const EDGE_MOVE_INTERVAL = 16

// 模块级状态（由 init 注入）
let adapter = null
let settings = null
// 当前边缘持续移动的定时器引用（同一时刻只允许一个方向持续移动）
let edgeMoveTimer = null

/**
 * 安全执行 adapter 方法：兼容同步/异步返回，统一吞掉异常并打日志，绝不抛出
 * @param {*} p adapter 方法返回值（可能是 Promise）
 * @param {string} context 操作描述（用于日志）
 */
function safeRun(p, context) {
  if (p && typeof p.then === 'function') {
    p.catch((err) => {
      console.error(`[mouse-controller] ${context} 执行失败:`, err && err.message ? err.message : err)
    })
  }
}

/**
 * 计算鼠标移动的加速度倍率（DPI 风格：更灵敏）
 * 规则：开启加速度且 speed > 0.5 时，倍率随 speed 增长，上限 3.0
 *   speed=0.5 → 1.0；speed=1.0 → 1.5；speed=2.0 → 2.5；speed≥2.5 → 3.0
 * @param {number} speed 滑动速度（来自 payload.speed）
 * @returns {number} 加速度倍率
 */
function computeAccelFactor(speed) {
  if (!settings || !settings.mouseAcceleration) return 1.0
  const s = Number(speed)
  if (!Number.isFinite(s) || s <= 0.5) return 1.0
  // 1.0 + (speed-0.5)*1.0，封顶 3.0（比旧版阈值更低、系数更大，更灵敏）
  return Math.min(3.0, 1.0 + (s - 0.5) * 1.0)
}

/**
 * 取滚动灵敏度倍率（垂直/水平分别取对应数值，兼容旧字符串档位）
 * @param {'vertical'|'horizontal'} axis
 * @returns {number}
 */
function scrollMultiplier(axis) {
  const key = axis === 'horizontal' ? 'horizontalScrollSensitivity' : 'verticalScrollSensitivity'
  const val = (settings && settings[key]) ?? 1.0
  // 兼容旧字符串档位
  if (typeof val === 'string' && LEGACY_SENSITIVITY[val] != null) return LEGACY_SENSITIVITY[val]
  const n = Number(val)
  return Number.isFinite(n) ? n : 1.0
}

/**
 * 初始化鼠标控制器
 * @param {object} ada 输入适配器实例
 * @param {object} stt 当前设置项（DEFAULT_SETTINGS 结构）
 */
function init(ada, stt) {
  adapter = ada
  settings = stt || null
  if (adapter && settings) {
    adapter.setMouseSensitivity(settings.mouseSensitivity)
  }
}

/**
 * 更新设置项（设置变更时调用，会同步 adapter 灵敏度）
 * @param {object} stt 新设置项
 */
function updateSettings(stt) {
  settings = stt || settings
  if (adapter && settings) {
    adapter.setMouseSensitivity(settings.mouseSensitivity)
  }
}

/**
 * 停止边缘持续移动并清理定时器（避免内存泄漏）
 */
function stopEdgeMove() {
  if (edgeMoveTimer) {
    clearInterval(edgeMoveTimer)
    edgeMoveTimer = null
  }
}

/**
 * 启动边缘持续移动
 * @param {string} direction 方向（left/right/up/down）
 * @param {number} speed payload.speed
 */
function startEdgeMove(direction, speed) {
  // 先停掉旧定时器（同一时刻只允许一个方向）
  stopEdgeMove()
  // 边缘移动速度：直接是每帧像素数（默认8），兼容旧字符串档位
  const rawSpeed = (settings && settings.edgeMoveSpeed) ?? 8
  let step
  if (typeof rawSpeed === 'string' && LEGACY_SENSITIVITY[rawSpeed] != null) {
    step = LEGACY_SENSITIVITY[rawSpeed] * 8
  } else {
    step = Number(rawSpeed)
  }
  if (!Number.isFinite(step) || step <= 0) step = 12
  step = Math.min(30, Math.max(1, step))
  // speed 额外加权（payload.speed 影响持续移动快慢）
  const speedFactor = Number(speed) > 0 ? Math.min(2.0, Number(speed)) : 1.0
  step = step * speedFactor

  // 计算每帧位移方向
  let dx = 0
  let dy = 0
  switch (direction) {
    case EdgeDirection.LEFT:
      dx = -step
      break
    case EdgeDirection.RIGHT:
      dx = step
      break
    case EdgeDirection.UP:
      dy = -step
      break
    case EdgeDirection.DOWN:
      dy = step
      break
    default:
      console.warn(`[mouse-controller] 未知边缘方向: "${direction}"，已忽略`)
      return
  }

  edgeMoveTimer = setInterval(() => {
    if (!adapter) return
    // edge_move 不再叠加加速度/灵敏度，按 step 直接移动（adapter 仍会乘灵敏度）
    safeRun(adapter.moveMouse(dx, dy), 'edge_move')
  }, EDGE_MOVE_INTERVAL)
}

/**
 * 处理鼠标事件总入口
 * @param {string} type 事件类型（protocol EventType.MOUSE_* / EDGE_MOVE_*）
 * @param {object} payload 事件载荷
 * @param {object} [stt] 可选设置项（覆盖模块内 settings）
 */
function handleMouseEvent(type, payload = {}, stt) {
  if (stt) updateSettings(stt)
  if (!adapter) {
    console.warn('[mouse-controller] adapter 未初始化，忽略事件:', type)
    return
  }

  try {
    switch (type) {
      case EventType.MOUSE_MOVE: {
        const { dx, dy, speed } = payload
        const accel = computeAccelFactor(speed)
        // 加速度在 controller 应用，灵敏度在 adapter 应用
        safeRun(adapter.moveMouse(Number(dx) * accel, Number(dy) * accel), 'mouse_move')
        break
      }
      case EventType.MOUSE_CLICK: {
        const { button, clicks } = payload
        safeRun(adapter.clickMouse(button || 'left', clicks || 1), 'mouse_click')
        break
      }
      case EventType.MOUSE_DOWN: {
        safeRun(adapter.pressMouseDown(payload.button || 'left'), 'mouse_down')
        break
      }
      case EventType.MOUSE_UP: {
        safeRun(adapter.pressMouseUp(payload.button || 'left'), 'mouse_up')
        break
      }
      case EventType.MOUSE_SCROLL: {
        const { deltaX, deltaY } = payload
        const finalDx = Number(deltaX) * scrollMultiplier('horizontal')
        const finalDy = Number(deltaY) * scrollMultiplier('vertical')
        safeRun(adapter.scrollMouse(finalDx, finalDy), 'mouse_scroll')
        break
      }
      case EventType.EDGE_MOVE_START: {
        startEdgeMove(payload.direction, payload.speed)
        break
      }
      case EventType.EDGE_MOVE_STOP: {
        stopEdgeMove()
        break
      }
      default:
        console.warn(`[mouse-controller] 未处理的鼠标事件类型: ${type}`)
    }
  } catch (err) {
    // 兜底：任何同步异常都不应打断事件循环
    console.error(`[mouse-controller] 处理 ${type} 时异常:`, err && err.message ? err.message : err)
  }
}

/**
 * 销毁控制器：清理定时器，释放引用
 * 在连接断开 / 应用退出时调用
 */
function dispose() {
  stopEdgeMove()
  adapter = null
  settings = null
}

module.exports = {
  init,
  updateSettings,
  handleMouseEvent,
  dispose
}
