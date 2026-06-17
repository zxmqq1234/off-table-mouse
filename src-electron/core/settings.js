/**
 * 设置模块 —— 持久化存储与变更通知
 *
 * 职责：
 *  - 把设置项以 JSON 文件形式持久化到磁盘（Electron userData 目录下的 settings.json）
 *  - 提供 loadSettings / getSettings / updateSettings / resetSettings 方法
 *  - 通过 EventEmitter 在设置变更时通知订阅者（主进程会监听并下发到控制层 + 渲染进程）
 *
 * 设计说明：
 *  - 本模块不直接依赖 electron，文件路径由调用方（main/index.js）通过 init 传入，
 *    保持 core 层的可测试性与纯净性。
 *  - 设置项结构以 shared/constants.js 的 DEFAULT_SETTINGS 为基准，缺失项自动补默认值，
 *    多余项忽略，保证版本升级时的向前兼容。
 */

const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')
const { DEFAULT_SETTINGS } = require('../../shared/constants')

// 文件存储路径（init 后赋值）
let storagePath = null
// 内存中的当前设置（merge 过默认值的完整对象）
let currentSettings = null
// 变更事件总线
const bus = new EventEmitter()

/**
 * 初始化设置模块，指定持久化文件路径并加载已存设置
 * @param {string} userDataDir Electron userData 目录（或任意可写目录）
 * @returns {object} 加载后的完整设置项
 */
function init(userDataDir) {
  storagePath = path.join(userDataDir, 'settings.json')
  return loadSettings()
}

/**
 * 合并用户设置与默认设置：以 DEFAULT_SETTINGS 为底，用户存盘值覆盖
 * 缺失键自动补默认值，未知键忽略，保证结构稳定
 * @param {object} raw 用户存盘的原始设置（可能不完整）
 * @returns {object} 合并后的完整设置
 */
function mergeWithDefaults(raw) {
  const merged = { ...DEFAULT_SETTINGS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in raw && raw[key] !== undefined && raw[key] !== null) {
        merged[key] = raw[key]
      }
    }
  }
  return merged
}

/**
 * 从磁盘加载设置；文件不存在或解析失败时回退默认值（并尝试写回一份默认配置）
 * @returns {object} 完整设置项
 */
function loadSettings() {
  try {
    if (storagePath && fs.existsSync(storagePath)) {
      const raw = fs.readFileSync(storagePath, 'utf-8')
      const parsed = JSON.parse(raw)
      currentSettings = mergeWithDefaults(parsed)
    } else {
      // 首次启动：用默认值并落盘
      currentSettings = { ...DEFAULT_SETTINGS }
      saveSettings(currentSettings)
    }
  } catch (err) {
    console.error('[settings] 加载设置失败，回退默认值:', err.message)
    currentSettings = { ...DEFAULT_SETTINGS }
  }
  return currentSettings
}

/**
 * 把设置项写入磁盘（同步写，设置变更频率低，无需异步）
 * @param {object} settings 完整设置项
 */
function saveSettings(settings) {
  if (!storagePath) return
  try {
    // 确保目录存在
    const dir = path.dirname(storagePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(storagePath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[settings] 保存设置失败:', err.message)
  }
}

/**
 * 获取当前设置（内存值，未落盘的不会出现）
 * @returns {object} 设置项快照
 */
function getSettings() {
  if (!currentSettings) currentSettings = { ...DEFAULT_SETTINGS }
  return { ...currentSettings }
}

/**
 * 更新设置项（部分更新）
 *  - 合并到当前设置
 *  - 立即落盘
 *  - 触发 'change' 事件，订阅者（主进程）据此下发到控制层与渲染进程
 * @param {object} patch 待更新的键值对
 * @returns {object} 更新后的完整设置
 */
function updateSettings(patch) {
  if (!patch || typeof patch !== 'object') {
    return getSettings()
  }
  // 校验：只接受 DEFAULT_SETTINGS 中已定义的键，并做基本类型保护
  const safePatch = {}
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in patch && patch[key] !== undefined && patch[key] !== null) {
      safePatch[key] = patch[key]
    }
  }
  currentSettings = { ...currentSettings, ...safePatch }
  saveSettings(currentSettings)
  // 通知订阅者（返回完整设置快照，避免外部误改内部对象）
  bus.emit('change', getSettings())
  return getSettings()
}

/**
 * 重置为默认设置并落盘
 * @returns {object} 默认设置
 */
function resetSettings() {
  currentSettings = { ...DEFAULT_SETTINGS }
  saveSettings(currentSettings)
  bus.emit('change', getSettings())
  return getSettings()
}

/**
 * 订阅设置变更事件
 * @param {(settings:object)=>void} callback 设置变更回调
 * @returns {() => void} 取消订阅函数
 */
function onChange(callback) {
  if (typeof callback !== 'function') return () => {}
  bus.on('change', callback)
  return () => bus.off('change', callback)
}

module.exports = {
  init,
  loadSettings,
  getSettings,
  updateSettings,
  resetSettings,
  onChange,
  mergeWithDefaults
}
