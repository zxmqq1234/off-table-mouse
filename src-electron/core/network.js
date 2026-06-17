/**
 * 局域网 IP 获取模块
 *
 * 职责：使用 Node.js os.networkInterfaces() 自动识别本机局域网 IPv4 地址，
 * 用于生成手机扫码连接地址。
 *
 * 选择策略：
 * 1. 遍历所有网卡
 * 2. 排除回环（127.0.0.1）、IPv6、虚拟网卡（vmware/virtualbox/docker/wsl 等）
 * 3. 只返回标准局域网私有网段（192.168.x.x / 10.x.x.x / 172.16-31.x.x）
 * 4. 公网 IP 不作为局域网 IP 返回（V1 仅支持局域网，见 PRD 7.6 节）
 * 5. 获取失败返回 null，由调用方做异常提示
 */

const os = require('os')

// 虚拟网卡名称关键词（命中即视为虚拟网卡并跳过，避免返回不可达地址）
const VIRTUAL_IFACE_KEYWORDS = [
  'vmware',
  'vmnet',
  'virtualbox',
  'vbox',
  'docker',
  'veth',
  'br-', // docker 自定义网桥
  'virbr', // libvirt 网桥
  'wsl',
  'hyper-v',
  'tap',
  'tun',
  'bluetooth'
]

/**
 * 判断网卡名是否为虚拟网卡
 * @param {string} name 网卡名
 * @returns {boolean}
 */
function isVirtualInterface(name) {
  const lower = (name || '').toLowerCase()
  return VIRTUAL_IFACE_KEYWORDS.some(kw => lower.includes(kw))
}

/**
 * 判断 IPv4 是否属于标准私有局域网网段（RFC1918）
 * - 192.168.0.0/16
 * - 10.0.0.0/8
 * - 172.16.0.0/12（即 172.16.x.x ~ 172.31.x.x）
 * @param {string} ip IPv4 地址
 * @returns {boolean}
 */
function isPrivateIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false
  const [a, b] = parts
  if (a === 192 && b === 168) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/**
 * 获取本机局域网 IPv4 地址
 *
 * 遍历非虚拟网卡，返回第一个标准私有网段的 IPv4 地址。
 * 无合适地址时返回 null（调用方应提示用户检查网络）。
 *
 * @returns {string|null} 局域网 IPv4 地址，获取失败返回 null
 */
function getLocalIP() {
  let interfaces
  try {
    interfaces = os.networkInterfaces()
  } catch (e) {
    console.error('[network] 读取网卡失败:', e.message)
    return null
  }

  // 收集所有候选局域网 IP（非虚拟网卡 + 私有网段 + 非回环 IPv4）
  const candidates = []
  for (const [ifaceName, addrs] of Object.entries(interfaces || {})) {
    if (!addrs) continue
    if (isVirtualInterface(ifaceName)) continue // 跳过虚拟网卡
    for (const addr of addrs) {
      // Node 不同版本 family 可能是 'IPv4' 字符串或 4 数字，两者兼容
      if (addr.family !== 'IPv4' && addr.family !== 4) continue
      if (addr.internal) continue // 跳过回环
      if (!isPrivateIPv4(addr.address)) continue // V1 仅返回局域网地址
      candidates.push({ address: addr.address, ifaceName })
    }
  }

  if (candidates.length === 0) return null
  // 多个候选时返回第一个；后续可按网卡优先级排序
  return candidates[0].address
}

module.exports = {
  getLocalIP,
  // 导出辅助函数便于单元测试
  isPrivateIPv4,
  isVirtualInterface
}
