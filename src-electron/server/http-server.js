/**
 * HTTP 服务模块
 *
 * 职责：
 * - 使用 Node 原生 http 模块创建 HTTP 服务（不引入 express，减少依赖）
 * - 托管手机网页：
 *   - 生产环境（NODE_ENV !== 'development'）：从 dist-mobile/ 目录读取静态文件
 *   - 开发环境：反向代理到手机端 Vite dev server（http://localhost:5174）
 * - 端口被占用时自动递增重试，全部失败抛错由调用方提示用户（PRD 12.3 节容错要求）
 *
 * 重要：本模块只处理 HTTP 请求；WebSocket 升级（upgrade）请求由 ws-server
 * 通过共享的 server 实例处理，本模块不干预 'upgrade' 事件。
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')

const { DEFAULT_PORT } = require('../../shared/constants')

// 手机端 Vite dev server 默认端口（见 vite.config.mobile.js）
const MOBILE_DEV_PORT = 5174
const MOBILE_DEV_ORIGIN = `http://localhost:${MOBILE_DEV_PORT}`

// 静态文件扩展名 -> MIME 类型映射
const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
}

// 是否开发模式（模块加载时确定，Electron 启动前 cross-env 已设置 NODE_ENV）
const isDev = process.env.NODE_ENV === 'development'

// 运行时状态
let httpServer = null // 当前 http.Server 实例
let actualPort = null // 实际监听端口
let staticRoot = null // 生产环境静态文件根目录（dist-mobile 绝对路径）

/**
 * 处理生产模式的静态文件请求
 * - 防止目录穿越
 * - 文件不存在时回退到 index.html（支持前端路由 SPA）
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function serveStatic(req, res) {
  const parsed = url.parse(req.url)
  let pathname = decodeURIComponent(parsed.pathname || '/')
  if (pathname === '/' || pathname === '') pathname = '/index.html'

  const filePath = path.join(staticRoot, pathname)
  // 防目录穿越：解析后必须仍在静态根目录内
  if (!filePath.startsWith(staticRoot)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 回退：找不到文件时返回 index.html，交给前端路由处理
      const fallback = path.join(staticRoot, 'index.html')
      fs.readFile(fallback, (err2, data2) => {
        if (err2) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        res.writeHead(200, { 'Content-Type': MIME_MAP['.html'] })
        res.end(data2)
      })
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

/**
 * 处理开发模式的反向代理：把请求转发到手机端 Vite dev server
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function proxyToDev(req, res) {
  const parsed = url.parse(req.url)
  const proxyUrl = `${MOBILE_DEV_ORIGIN}${parsed.path || '/'}`

  const proxyReq = http.request(
    proxyUrl,
    {
      method: req.method,
      headers: { ...req.headers, host: `localhost:${MOBILE_DEV_PORT}` }
    },
    proxyRes => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )
  proxyReq.on('error', err => {
    console.error('[http-server] 反向代理失败:', err.message)
    if (!res.headersSent) {
      res.writeHead(502)
      res.end('Bad Gateway: 手机端 dev server (5174) 未启动？')
    }
  })
  req.pipe(proxyReq)
}

/**
 * 启动 HTTP 服务
 *
 * 端口策略：从 startPort 开始尝试，被占用（EADDRINUSE）则递增，
 * 最多重试 maxRetries 次，全部失败抛错。
 *
 * @param {number} [startPort=DEFAULT_PORT] 起始端口
 * @param {string} [staticDir] 生产环境静态文件根目录（开发模式可省略）
 * @param {number} [maxRetries=10] 端口占用时最大重试次数
 * @returns {Promise<{server: http.Server, port: number}>}
 */
function startHTTPServer(startPort = DEFAULT_PORT, staticDir, maxRetries = 10) {
  return new Promise((resolve, reject) => {
    staticRoot = staticDir ? path.resolve(staticDir) : null

    /**
     * 递归尝试在指定端口监听
     * @param {number} attempt 当前重试序号（0 起）
     */
    const tryListen = attempt => {
      const port = startPort + attempt
      const server = http.createServer((req, res) => {
        if (isDev) {
          proxyToDev(req, res)
        } else {
          serveStatic(req, res)
        }
      })

      // 监听前注册 error 处理器：端口被占用则递增重试
      server.on('error', err => {
        if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
          server.close()
          tryListen(attempt + 1)
          return
        }
        reject(err)
      })

      server.listen(port, () => {
        httpServer = server
        actualPort = port
        console.log(
          `[http-server] HTTP 服务已启动，端口 ${port}（${isDev ? '开发代理 -> ' + MOBILE_DEV_ORIGIN : '静态托管 ' + staticRoot}）`
        )
        resolve({ server, port })
      })
    }

    tryListen(0)
  })
}

/**
 * 停止 HTTP 服务
 * @returns {Promise<void>}
 */
function stopHTTPServer() {
  return new Promise(resolve => {
    const server = httpServer
    if (!server) {
      resolve()
      return
    }
    server.close(() => {
      httpServer = null
      actualPort = null
      resolve()
    })
    // 无论 close 回调是否及时触发，先清除引用，避免重复停止
    httpServer = null
    actualPort = null
  })
}

/**
 * 获取当前 HTTP 服务实际监听端口
 * @returns {number|null}
 */
function getPort() {
  return actualPort
}

module.exports = {
  startHTTPServer,
  stopHTTPServer,
  getPort
}
