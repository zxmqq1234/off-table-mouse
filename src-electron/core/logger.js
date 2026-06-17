/**
 * 连接日志模块 —— 内存环形缓冲 + 变更通知（任务2，PRD P1 #50）
 *
 * 职责：
 *  - 在内存中保留最近 MAX_SIZE 条日志（环形缓冲，超出自动丢弃最旧的）
 *  - 提供 log / getRecent / clear 三个核心方法
 *  - 通过 EventEmitter 在新增日志时触发 'add' 事件，供主进程转发给渲染进程
 *
 * 设计说明：
 *  - 纯内存实现，不写文件（首版够用，排查连接问题足够；如需落盘可后续扩展）
 *  - 日志结构：{ ts: number, level: 'info'|'warn'|'error', message: string }
 *  - 线程安全：Node 单线程，无需加锁
 */

const { EventEmitter } = require('events')

// 环形缓冲最大容量（超出自动丢弃最旧条目）
const MAX_SIZE = 200

// 允许的日志级别
const LEVELS = ['info', 'warn', 'error']

// 内存缓冲数组（按时间顺序，oldest → newest）
const buffer = []
// 变更事件总线
const bus = new EventEmitter()

/**
 * 追加一条日志
 *  - 自动加上时间戳
 *  - 超过 MAX_SIZE 时丢弃最旧条目
 *  - 触发 'add' 事件，参数为新增的日志条目
 * @param {string} level 日志级别：'info' | 'warn' | 'error'
 * @param {string} message 日志内容
 */
function log(level, message) {
  // 级别非法时降级为 info，保证不丢日志
  const safeLevel = LEVELS.includes(level) ? level : 'info'
  const entry = {
    ts: Date.now(),
    level: safeLevel,
    message: typeof message === 'string' ? message : String(message)
  }
  buffer.push(entry)
  // 超容量：丢弃最旧（保持最近 MAX_SIZE 条）
  while (buffer.length > MAX_SIZE) {
    buffer.shift()
  }
  // 通知订阅者（主进程会监听并推送到渲染进程日志面板）
  bus.emit('add', entry)
}

/**
 * 获取最近的 n 条日志（默认全部，按时间顺序 oldest → newest）
 * @param {number} [n=MAX_SIZE] 取最近多少条
 * @returns {Array<{ts:number, level:string, message:string}>} 日志条目数组（浅拷贝，避免外部误改内部缓冲）
 */
function getRecent(n = MAX_SIZE) {
  const count = Math.max(0, Math.min(n, buffer.length))
  return buffer.slice(buffer.length - count)
}

/**
 * 清空所有日志
 */
function clear() {
  buffer.length = 0
}

/**
 * 订阅新增日志事件
 * @param {(entry:{ts:number, level:string, message:string})=>void} callback 新增日志回调
 * @returns {() => void} 取消订阅函数
 */
function onAdd(callback) {
  if (typeof callback !== 'function') return () => {}
  bus.on('add', callback)
  return () => bus.off('add', callback)
}

module.exports = {
  log,
  getRecent,
  clear,
  onAdd,
  MAX_SIZE
}
