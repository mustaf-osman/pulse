# Nimo 硬件接入软件层分析报告

生成时间：2026-05-25 11:51

## 一、结论摘要

- Nimo 设备中心 v1 已完成软件侧硬件接入准备：设备 API、设备中心 UI、模拟设备闭环、局域网启动提示、固件请求示例和 smoke 自检。
- 当前软件处于可对接真实 ESP32-S3 固件的阶段；下一步重点从功能可用转向安全、持久化、诊断和长期维护。
- 短期硬件接入建议采用 HTTP 轮询方案：开机注册、定时心跳、读取配置、轮询下一条提醒、上报完成/稍后。

## 二、当前完成状态

| 模块 | 状态 | 说明 |
| --- | --- | --- |
| 设备中心 UI | 已完成 | 顶部/左侧导航已加入“设备”，可展示接入地址、LAN 状态、设备列表、提醒、协议和固件示例。 |
| 设备 API | 已完成 | 已具备 register、heartbeat、config、status、next-reminder、complete、snooze、test-push、stream。 |
| 模拟设备 | 已完成 | 可在无硬件条件下验证注册、心跳、测试推送、完成、稍后。 |
| 协议自检 | 已完成 | 新增 npm run smoke:device，非破坏性检查设备协议。 |
| LAN 模式 | 已具备 | 已有 npm run start:lan；硬件接入时需电脑和 ESP32-S3 处于同一 Wi-Fi。 |
| 安全配对 | 待增强 | 建议新增 pairing code、deviceToken 和接口鉴权。 |
| 设备落库 | 待增强 | 当前设备注册更偏运行态，建议落库保存真实设备、token、固件版本、最后心跳。 |
| 设备事件日志 | 待增强 | 建议记录硬件请求和错误，方便调试 ESP32-S3。 |

## 三、设备协议 v1

| 接口 | 方法 | 用途 | 请求参数/Body | 响应重点 | 是否会改数据 |
| --- | --- | --- | --- | --- | --- |
| /device/info | GET | 获取服务器、设备列表和协议清单 | 无 | server、devices、protocol | 否 |
| /device/register | POST | 设备开机注册 | id、name、type、capabilities | device、server | 是，登记/更新设备 |
| /device/heartbeat | POST | 设备心跳保活 | deviceId | device、serverTime | 是，更新 lastSeenAt |
| /device/config | GET | 读取设备配置 | deviceId 查询参数 | pollIntervalSeconds、heartbeatSeconds、actions、snoozeMinutes | 轻微，touch 设备 |
| /device/status | GET | 读取设备状态 | deviceId 可选 | server、devices | 轻微，touch 设备 |
| /device/next-reminder | GET | 拉取下一条 active 提醒 | deviceId 查询参数 | reminder 或 null | 轻微，touch 设备 |
| /device/complete | POST | 硬件完成提醒 | deviceId、reminderId | changes、reminder | 是，完成提醒 |
| /device/snooze | POST | 硬件稍后提醒 | deviceId、reminderId、minutes | dueAt、minutes、reminder | 是，修改提醒时间 |
| /device/test-push | POST | 测试推送事件 | deviceId、title、task 可选 | payload | 否，不改真实提醒 |
| /device/stream | GET | 设备 SSE 实时事件流 | deviceId 查询参数 | SSE 事件 | 否 |

## 四、ESP32-S3 固件最小接入流程

| 步骤 | 固件动作 | 软件接口 | 成功标准 |
| --- | --- | --- | --- |
| 1 | 连接 Wi-Fi | 无 | ESP32-S3 与电脑在同一局域网 |
| 2 | 开机注册设备 | POST /device/register | 设备中心显示新设备 |
| 3 | 读取配置 | GET /device/config | 获得轮询和心跳间隔 |
| 4 | 定时心跳 | POST /device/heartbeat | 设备中心 90 秒内显示在线 |
| 5 | 轮询提醒 | GET /device/next-reminder | 屏幕显示下一条 active 提醒 |
| 6 | 用户点完成 | POST /device/complete | 提醒状态变为 completed |
| 7 | 用户点稍后 | POST /device/snooze | 提醒 dueAt 延后指定分钟 |

## 五、软件后续路线图

| 阶段 | 目标 | 软件任务 | 优先级 | 验收方式 |
| --- | --- | --- | --- | --- |
| P0 已完成 | 硬件接入协议可用 | 设备中心、API、模拟设备、smoke:device | 已完成 | npm run smoke:device 通过 |
| P1 | 真实硬件安全接入 | 配对码、deviceToken、接口鉴权 | 高 | 未授权请求被拒绝，已配对设备可用 |
| P1 | 设备可长期管理 | 设备表落库、重命名、删除、固件版本、最后心跳 | 高 | 重启后设备仍存在 |
| P1 | 调试可观测 | 设备事件日志、错误统计、最近请求、离线原因 | 中高 | 设备页可看到最近 20 条事件 |
| P2 | 提醒展示更精细 | ack、displayText、speakText、priority、sound、requiresAck | 中 | 硬件不重复展示已确认提醒 |
| P2 | LAN 诊断 | 端口检测、防火墙提示、二维码配置 | 中 | 页面可判断硬件是否可连 |
| P3 | 长期维护 | OTA 元信息、配置下发、WebSocket/MQTT 方案 | 中低 | 设备可上报版本并读取升级信息 |

## 六、风险与建议

| 风险 | 影响 | 当前状态 | 建议处理 |
| --- | --- | --- | --- |
| 局域网未开启 | ESP32-S3 无法访问电脑 API | 当前默认 127.0.0.1 | 硬件调试使用 npm run start:lan，并放行 Windows 防火墙 |
| 无设备鉴权 | 同网段设备可能误调用提醒接口 | 待增强 | 实现 pairing code + deviceToken |
| 设备状态未持久化 | 重启后设备记录丢失 | 待增强 | 新增 devices 表和 device_events 表 |
| 轮询延迟 | 提醒非实时 | 可接受 | 第一版使用 15 秒轮询；后续评估 SSE/WebSocket/MQTT |
| 普通 Node 与 better-sqlite3 ABI 不一致 | 部分本地脚本不能直接读提醒库 | 已在 smoke 中跳过 DB 依赖项 | 使用 Electron runtime 或重建 better-sqlite3 |
| 防火墙阻断 | 硬件无法连接 | 需现场验证 | 设备中心加入 LAN 诊断和二维码 |

## 七、涉及文件

| 文件 | 用途 |
| --- | --- |
| src/api.js | 设备 API、服务器信息、LAN 地址、协议清单 |
| src/ui/brain-ui/device-view.js | 设备中心前端逻辑、模拟设备、固件示例 |
| src/ui/brain-ui/app-shell.js | 设备页面结构、导航入口、接入清单 |
| src/ui/brain-ui/app.js | 初始化设备中心、SSE 事件分发 |
| src/ui/brain-ui/styles.css | 设备中心样式 |
| scripts/smoke-device.mjs | 设备协议非破坏性 smoke test |
| package.json | 新增 npm run smoke:device |

## 八、建议下一步

1. 优先实现设备配对码与 deviceToken。
2. 新增设备表和设备事件日志表。
3. 给设备中心增加局域网诊断和二维码配置。
4. 硬件到手后先用 HTTP 轮询跑通注册、心跳、拉取提醒、完成、稍后。
