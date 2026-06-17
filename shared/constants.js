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
  // 灵敏度统一为数值：鼠标/滚动为倍率（0.1~3.0，1.0=标准），边缘移动为每帧像素（1~20，8=标准）
  DEFAULT_SETTINGS: {
    mouseSensitivity: 1.0,
    mouseAcceleration: true,
    verticalScrollSensitivity: 1.0,
    horizontalScrollSensitivity: 1.0,
    edgeMoveSpeed: 8,
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
    minimizeToTray: true
  }
}
