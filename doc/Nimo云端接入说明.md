# Nimo 云端接入说明（不依赖电脑）

> 生成日期：2026-07-27
> 云端服务：nimo-hub（部署在 47.95.233.212，域名 cloud.agent1.xin）

## 一、总览

原来手机和 ESP32 都必须连「电脑上的 Nimo（start:lan）」。现在服务器上部署了独立的
**nimo-hub** 服务，实现与桌面版完全相同的提醒 + 设备协议（protocolVersion 2），
手机和硬件直连云端，电脑关机也能用。

```text
手机 App ──HTTPS──►  https://cloud.agent1.xin/nimo  ◄──HTTPS── ESP32-S3
                     （服务器 47.95.233.212, pm2: nimo-hub, 端口 3721, Caddy 反代）
```

- 基址：`https://cloud.agent1.xin/nimo`
- 鉴权：所有请求带请求头 `X-Nimo-Key: <API Key>`（`/api/health` 除外）
- API Key 保存在服务器 `/opt/nimo-hub/.env` 的 `NIMO_API_KEY`（勿提交 Git）
- 数据存储：`/opt/nimo-hub/data/hub.json`（JSON 文件，重启不丢）
- 局域网模式仍然可用：手机/固件把地址换回 `http://电脑IP:3721` 即可（Key 留空）

## 二、接口（与桌面版协议一致）

- `GET  /api/health` 健康检查（无需 Key）
- `GET/POST /reminders`、`POST /reminders/:id/complete|snooze|cancel`、`GET /reminders/completed`
- `POST /device/register|heartbeat|complete|snooze|test-push`
- `GET  /device/info|status|config|screen-status|next-reminder`
- 暂未实现：speech 语音队列、WS、voice/pcm（云端无 TTS/ASR，属后续项）

## 三、本次改动的文件

| 文件 | 改动 |
|------|------|
| `android-app/app/src/main/assets/mobile.html` | 宣传页改为真功能页：提醒列表/新建/完成/稍后/取消、设备在线状态、测试推送、设置页（服务器地址 + API Key，localStorage 保存） |
| `android-app/app/src/main/AndroidManifest.xml` | 加 `usesCleartextTraffic="true"`（局域网 http 模式用） |
| `firmware/nimo-esp32s3-minimal/nimo-esp32s3-minimal.ino` | 新增 `nimoHttpBegin()`：支持 https（WiFiClientSecure setInsecure）并自动附带 `X-Nimo-Key` 头 |
| `firmware/nimo-esp32s3-minimal/private_config.example.h` | 加云端地址示例与 `#define NIMO_API_KEY`（注意必须用 #define） |
| `cloud-hub/server.js` | 云端 nimo-hub 服务源码（与服务器上运行的一致） |

## 四、怎么用

### 手机
1. Android Studio 打开 `android-app`，Build APK 安装
2. App → 设置页：地址填 `https://cloud.agent1.xin/nimo`，填 API Key，保存
3. 提醒页创建提醒；设备页看 ESP32 在线状态

### 硬件
1. 复制 `private_config.example.h` → `private_config.h`
2. `NIMO_BASE_URL = "https://cloud.agent1.xin/nimo"`，`#define NIMO_API_KEY "<Key>"`
3. 烧录，串口看 `register/heartbeat 200`

### 服务器运维
```bash
pm2 status nimo-hub          # 状态
pm2 logs nimo-hub            # 日志
pm2 restart nimo-hub         # 重启
cat /opt/nimo-hub/.env       # 查看/修改 API Key（改后 pm2 restart nimo-hub --update-env）
```
Caddy 路由：`/etc/caddy/Caddyfile` 中 `cloud.agent1.xin` 块的 `handle_path /nimo/*`。
newpulse-cloud（8787）不受影响。

## 五、后续可做（P1/P2）
- 设备级 pairing + 每设备 deviceToken（当前是单一共享 Key）
- speech/TTS 云端化（需接 TTS 服务）
- 手机推送通知（到点提醒手机）
- 桌面 Nimo 与云端提醒双向同步
