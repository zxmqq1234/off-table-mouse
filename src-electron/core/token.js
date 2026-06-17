/**
 * 一次性 Token 管理模块
 *
 * 职责：生成、校验、撤销连接 Token。
 *
 * 安全策略（依据 PRD 7.6 节）：
 * - Token 随机生成（crypto.randomBytes 转 hex，32 字节 = 64 位 hex 字符串）
 * - 同一时间只有一个有效 Token：createToken 时旧 Token 立即失效
 * - Token 有过期时间（TTL = constants.TOKEN_TTL，默认 10 分钟）
 * - validateToken 过期或不存在返回 false
 *
 * 数据结构（单 Token 模型，符合 V1 "一次性 + 刷新即失效" 语义）：
 *   currentToken = { token, createdAt, expiresAt }
 */

const crypto = require('crypto')
const { TOKEN_TTL } = require('../../shared/constants')

// 当前有效的 Token 记录，null 表示无 Token
let currentToken = null

/**
 * 生成新 Token 并让旧 Token 立即失效
 * （依据需求：同一时间只有一个有效 Token）
 * @returns {{token: string, createdAt: number, expiresAt: number}}
 */
function createToken() {
  // 32 字节随机数转 hex = 64 位字符，足够防止暴力猜测
  const token = crypto.randomBytes(32).toString('hex')
  const createdAt = Date.now()
  const expiresAt = createdAt + TOKEN_TTL
  // 直接覆盖旧记录，等价于旧 Token 立即失效
  currentToken = { token, createdAt, expiresAt }
  return currentToken
}

/**
 * 校验 Token 是否有效（存在且未过期）
 * @param {string} token 待校验的 Token
 * @returns {boolean}
 */
function validateToken(token) {
  if (!token || !currentToken) return false
  if (currentToken.token !== token) return false
  if (Date.now() > currentToken.expiresAt) {
    // 已过期，主动清理避免下次再判断
    currentToken = null
    return false
  }
  return true
}

/**
 * 撤销指定 Token
 * @param {string} token
 */
function revokeToken(token) {
  if (currentToken && currentToken.token === token) {
    currentToken = null
  }
}

/**
 * 撤销所有 Token（当前实现只有一个，等价于清空）
 */
function revokeAll() {
  currentToken = null
}

/**
 * 获取当前 Token 记录（供上层构造二维码地址等场景使用）
 * @returns {object|null}
 */
function getCurrentToken() {
  return currentToken
}

module.exports = {
  createToken,
  validateToken,
  revokeToken,
  revokeAll,
  getCurrentToken
}
