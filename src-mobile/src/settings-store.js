/**
 * 手机端共享设置状态（轻量响应式 store）
 *
 * 职责：
 *  - 单例 reactive settings，供 settings-panel（写）和 control-page（读）共享
 *  - 从 localStorage 加载/保存，保证跨组件实时同步
 *  - 暴露 applySettings(patch) 供外部同步（如 WS 下发回填）
 *
 * 设计：用 Vue reactive 做单例，所有 import 同一对象的组件共享引用，
 *       一处修改处处响应（control-page 的 sensFactor 会自动读到最新值）。
 */
import { reactive } from 'vue'
import { DEFAULT_SETTINGS } from '@shared/constants.js'

const STORAGE_KEY = 'otm-mobile-settings'

// 单例响应式 settings（初始用默认值，挂载时从 localStorage merge）
const settings = reactive({ ...DEFAULT_SETTINGS })

/** 是否已从 localStorage 初始化（避免重复加载） */
let initialized = false

/**
 * 从 localStorage 加载设置并 merge 到响应式单例
 */
export function loadSettings() {
  if (initialized) return
  initialized = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (key in saved && saved[key] !== undefined && saved[key] !== null) {
          settings[key] = saved[key]
        }
      })
    }
  } catch (_e) {
    // 解析失败忽略，用默认值
  }
}

/**
 * 保存当前 settings 到 localStorage
 */
export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings }))
  } catch (_e) {
    // 存储满/隐私模式忽略
  }
}

/**
 * 部分更新 settings 并立即保存
 * @param {object} patch 待更新的键值对
 */
export function applySettings(patch) {
  if (!patch || typeof patch !== 'object') return
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    if (key in patch && patch[key] !== undefined && patch[key] !== null) {
      settings[key] = patch[key]
    }
  })
  saveSettings()
}

/**
 * 重置为默认设置
 */
export function resetSettings() {
  Object.keys(DEFAULT_SETTINGS).forEach(key => {
    settings[key] = DEFAULT_SETTINGS[key]
  })
  saveSettings()
}

/**
 * 获取 settings 单例（响应式，import 后直接读字段即可，修改自动触发依赖更新）
 * @returns {Record<string, any>}
 */
export function useSettings() {
  // 首次访问时自动从 localStorage 加载
  loadSettings()
  return settings
}
