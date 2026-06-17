/**
 * 二维码生成模块
 *
 * 职责：
 * - 构造手机扫码后访问的连接 URL
 * - 生成二维码图片的 Data URL（base64），供桌面端 GUI 直接用 <img> 显示
 *
 * 连接 URL 格式（依据 PRD 10.1 节通用字段与第6节连接流程）：
 *   http://{ip}:{port}/?token={token}
 *
 * 说明：手机扫码后浏览器打开该 URL，由电脑端 HTTP 服务返回控制网页，
 * 网页再用 URL 中的 token 发起 WebSocket 连接请求。
 */

const QRCode = require('qrcode')

/**
 * 构造手机连接 URL
 * @param {string} ip 局域网 IP
 * @param {number} port HTTP 服务端口
 * @param {string} token 一次性 Token
 * @returns {string} 连接 URL
 */
function generateConnectURL(ip, port, token) {
  return `http://${ip}:${port}/?token=${encodeURIComponent(token)}`
}

/**
 * 生成二维码图片的 Data URL（base64 编码的 PNG）
 * @param {string} url 需要编码进二维码的内容（通常是连接 URL）
 * @returns {Promise<string>} 形如 data:image/png;base64,... 的字符串
 */
async function generateQRCode(url) {
  // toDataURL 直接输出 base64 PNG，便于 GUI 用 <img src="..."> 显示
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M', // 中等容错，兼顾密度与可读性
    margin: 2,
    width: 320
  })
}

module.exports = {
  generateConnectURL,
  generateQRCode
}
