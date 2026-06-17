/**
 * 全局常量定义（前后端共享）
 */

module.exports = {
  // 默认服务端口
  DEFAULT_PORT: 8765,

  // Token 有效期：10 分钟（毫秒）
  TOKEN_TTL: 10 * 60 * 1000,

  // 心跳间隔：15 秒
  HEARTBEAT_INTERVAL: 15000,

  // 心跳超时：45 秒无响应判定断线
  HEARTBEAT_TIMEOUT: 45000,

  // 默认设置项（对应 PRD 7.5 节）
  // 灵敏度统一为数值：鼠标/滚动为倍率（0.1~10.0，类似 DPI 调节），边缘移动为每帧像素（1~30）
  DEFAULT_SETTINGS: {
    mouseSensitivity: 3.0,
    mouseAcceleration: true,
    verticalScrollSensitivity: 5.0,
    horizontalScrollSensitivity: 5.0,
    edgeMoveSpeed: 12,
    clickThreshold: 200,
    longPressThreshold: 500,
    doubleClickInterval: 300,
    enableTwoFingerGesture: true,
    enableThreeFingerGesture: true,
    enableDrag: true,
    enableRealtimeInput: true,
    serverPort: 'auto',
    themeMode: 'system',
    // 关闭窗口时最小化到系统托盘（任务6，PRD P1 #54）；默认开启
    minimizeToTray: true,
    // 手机连接是否免确认（true=手机扫码后自动连接，不弹确认框；false=需电脑端手动允许）
    autoApproveConnect: true
  }
}
