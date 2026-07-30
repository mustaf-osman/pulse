# NewPulse 云端商业授权后台技术方案 V1

## 1. 目标定位

NewPulse 从本地工具升级为正规商业授权软件。用户下载安装后不能直接使用，必须通过云端账号、订阅和权限校验。

V1 的核心目标：

- 用户必须登录云端账号后才能进入软件。
- 每个账号按月订阅。
- 后台可创建邀请码、管理账号、订阅、设备、功能权限。
- 一个账号默认只允许绑定一台电脑。
- 后台禁用账号或强制下线后，客户端立即退出或锁定。
- 订阅到期后降级为免费版，保留少量每日试用额度。
- 第一阶段云端只同步账号授权，不同步客户、监督、知识库等业务数据。

## 2. 已确认产品决策

| 项目 | 决策 |
| --- | --- |
| 云后台形态 | 单独新项目，建议命名为 `newpulse-cloud` |
| 数据库 | 第一版 SQLite，后续迁移 PostgreSQL/MySQL |
| 后端技术 | 按最快稳定实现，建议 Node.js + Express |
| 管理后台 | 第一版就做正规后台 UI |
| 客户端登录方式 | 邮箱 + 密码 |
| 账号创建方式 | 邀请码注册 |
| 设备限制 | 一个账号只允许绑定一台电脑 |
| 到期策略 | 降级免费版 |
| 免费版能力 | 保留基础每日试用额度 |
| 云端同步范围 | 第一阶段只同步账号授权 |
| 收款方式 | 手动收款，后台手动开通/续费 |
| 强制下线 | 后台操作后客户端立刻下线 |
| 离线规则 | 后台按账号配置 |

## 3. 总体架构

```text
NewPulse Electron 客户端
        │
        │ HTTPS API
        │ WebSocket 实时控制
        ▼
NewPulse Cloud 云端授权服务
        │
        ├── Auth API 登录/注册/刷新 token
        ├── License API 授权校验/订阅校验/功能权限
        ├── Device API 设备绑定/解绑/在线状态
        ├── Admin API 后台管理账号/订阅/权限/邀请码
        ├── Realtime Gateway 实时强制下线/权限变更推送
        ▼
SQLite 数据库 V1
后续可迁移 PostgreSQL/MySQL
```

## 4. 项目结构建议

建议新建独立项目：

```text
newpulse-cloud/
  package.json
  .env.example
  README.md
  data/
    newpulse-cloud.sqlite
  src/
    server.js
    config.js
    db/
      index.js
      schema.js
      migrations.js
    middleware/
      auth.js
      admin-auth.js
      error-handler.js
    modules/
      auth/
        routes.js
        service.js
      admin/
        routes.js
        service.js
      license/
        routes.js
        service.js
      devices/
        routes.js
        service.js
      invites/
        routes.js
        service.js
      realtime/
        socket.js
    public/
      admin/
        index.html
        app.js
        styles.css
```

V1 可以先用 Express 同时服务 API 和后台静态页面，减少部署复杂度。

## 5. 核心模块设计

### 5.1 账号系统

账号使用邮箱和密码登录。

账号状态：

- `active`：正常可用。
- `disabled`：被平台禁用，不能登录，在线客户端立即下线。
- `suspended`：暂停使用，通常用于风控或欠费处理。
- `deleted`：软删除。

账号角色：

- `super_admin`：平台超级管理员，也就是你。
- `company_admin`：公司老板/管理员。
- `employee`：普通员工。
- `trial`：试用账号。

V1 可以先实现 `super_admin` 和普通 `user`，后续扩展公司角色。

### 5.2 邀请码注册

用户不能完全自由注册，必须输入有效邀请码。

邀请码字段：

- 邀请码字符串。
- 可使用次数。
- 过期时间。
- 默认套餐。
- 默认试用天数。
- 默认功能权限。
- 是否启用。

注册流程：

1. 用户打开客户端。
2. 点击注册。
3. 输入邮箱、密码、邀请码。
4. 云端校验邀请码。
5. 创建账号。
6. 生成订阅记录。
7. 绑定当前设备。
8. 返回登录 token 和授权信息。

### 5.3 订阅系统

V1 按账号/月付费，先手动收款后台开通。

订阅状态：

- `trial`：试用。
- `active`：已付费有效。
- `expired`：已到期。
- `paused`：管理员暂停。
- `canceled`：取消。

后台可设置：

- 套餐名。
- 月费金额。
- 开始时间。
- 到期时间。
- 续费月份。
- 到期后策略。

到期后策略 V1：

- 降级为免费版。
- 免费版保留每日基础额度。
- 高级功能锁定。

### 5.4 功能权限系统

功能权限不应只靠前端隐藏，必须由云端返回授权信息，客户端本地做守卫。

建议功能键：

| feature_key | 功能 |
| --- | --- |
| `ai_chat` | AI 聊天 |
| `customer_crm` | 客户管理 |
| `activity_supervision` | 工作监督 |
| `boss_dashboard` | 老板看板 |
| `company_knowledge` | 公司知识库 |
| `data_export` | 数据导出 |
| `voice_input` | 语音输入 |
| `advanced_reports` | 高级报表 |

权限来源：

1. 套餐默认权限。
2. 账号单独覆盖权限。
3. 到期后免费版权限。

### 5.5 设备绑定

你选择一个账号只允许一台电脑。

客户端首次登录时生成设备指纹。

设备指纹可以由以下信息组合后哈希：

- 操作系统。
- 主机名。
- 用户名。
- Electron 生成的安装 ID。
- 本地随机 device secret。

注意：不要直接上传敏感原始硬件信息，上传哈希后的 `device_fingerprint` 即可。

设备规则：

- 第一次登录自动绑定当前设备。
- 之后同账号只能在绑定设备登录。
- 后台可以解绑设备。
- 后台可以查看设备最后在线时间。
- 后台可以强制踢下线设备。

### 5.6 实时强制下线

因为你要求“立刻下线”，V1 需要 WebSocket。

客户端登录后建立 WebSocket：

```text
wss://cloud.newpulse.xxx/realtime?token=xxx&deviceId=xxx
```

服务端推送事件：

| 事件 | 含义 | 客户端动作 |
| --- | --- | --- |
| `force_logout` | 后台强制下线 | 清 token，跳登录页 |
| `account_disabled` | 账号被禁用 | 锁定软件 |
| `subscription_changed` | 订阅变化 | 重新拉取授权 |
| `permission_changed` | 功能权限变化 | 刷新菜单和功能锁 |
| `device_unbound` | 当前设备被解绑 | 退出登录 |
| `license_expired` | 授权过期 | 进入免费版或锁定页 |

兜底机制：

- WebSocket 断开后自动重连。
- 客户端每 1 分钟轮询一次 `/license/check`。
- 即使 WebSocket 失败，也能在 1 分钟内同步禁用状态。

### 5.7 离线策略

你选择后台按账号配置。

每个账号可配置：

- 是否允许离线。
- 离线宽限小时数。
- 过期后动作。

建议默认：

- 普通账号：允许离线 24 小时。
- 高风险账号：不允许离线。
- 企业账号：允许离线 72 小时。

本地缓存授权必须包含服务端签名，避免用户手改本地文件。

V1 可先实现基础版：

- 缓存最后一次成功授权。
- 超过离线宽限期就进入锁定页。
- 恢复联网后重新校验。

## 6. 数据库设计 V1

### 6.1 users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  company_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 6.2 invites

```sql
CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  default_plan TEXT NOT NULL DEFAULT 'trial',
  trial_days INTEGER NOT NULL DEFAULT 7,
  expires_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 6.3 subscriptions

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  monthly_price INTEGER DEFAULT 0,
  expire_behavior TEXT NOT NULL DEFAULT 'free_quota',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 6.4 feature_permissions

```sql
CREATE TABLE feature_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  quota_daily INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, feature_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 6.5 devices

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, device_fingerprint),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 6.6 sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);
```

### 6.7 license_policies

```sql
CREATE TABLE license_policies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  require_online INTEGER NOT NULL DEFAULT 0,
  offline_grace_hours INTEGER NOT NULL DEFAULT 24,
  max_devices INTEGER NOT NULL DEFAULT 1,
  max_online_devices INTEGER NOT NULL DEFAULT 1,
  force_logout_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 6.8 usage_quotas

```sql
CREATE TABLE usage_quotas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  quota_date TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  limit_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, feature_key, quota_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 6.9 admin_audit_logs

```sql
CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_user_id) REFERENCES users(id)
);
```

## 7. API 设计 V1

### 7.1 Auth API

#### POST `/api/auth/register`

邀请码注册。

请求：

```json
{
  "email": "user@example.com",
  "password": "password",
  "inviteCode": "NP-XXXX",
  "deviceFingerprint": "hash",
  "deviceName": "Windows PC"
}
```

返回：

```json
{
  "ok": true,
  "token": "jwt",
  "refreshToken": "refresh-token",
  "user": {},
  "license": {}
}
```

#### POST `/api/auth/login`

邮箱密码登录。

#### POST `/api/auth/logout`

退出登录并注销当前 session。

#### POST `/api/auth/refresh`

刷新 token。

### 7.2 License API

#### GET `/api/license/check`

客户端启动、定时轮询、功能使用前调用。

返回：

```json
{
  "ok": true,
  "accountStatus": "active",
  "subscriptionStatus": "active",
  "mode": "paid",
  "expiresAt": "2026-06-22T00:00:00.000Z",
  "offlineGraceHours": 24,
  "features": {
    "ai_chat": true,
    "customer_crm": true,
    "activity_supervision": true,
    "boss_dashboard": true,
    "company_knowledge": true,
    "data_export": false
  },
  "quotas": {
    "ai_chat_daily": {
      "used": 0,
      "limit": 20
    }
  }
}
```

#### POST `/api/license/consume-quota`

免费版或试用额度消耗。

### 7.3 Device API

#### GET `/api/devices/me`

查看当前账号绑定设备。

#### POST `/api/devices/bind`

绑定当前设备。

#### POST `/api/devices/unbind`

后台解绑设备。

### 7.4 Admin API

后台接口需要 `super_admin` 权限。

#### GET `/api/admin/overview`

后台首页统计。

#### GET `/api/admin/users`

账号列表。

#### POST `/api/admin/users`

创建账号。

#### PATCH `/api/admin/users/:id/status`

禁用、恢复、暂停账号。

#### PATCH `/api/admin/users/:id/subscription`

设置订阅套餐和到期时间。

#### PATCH `/api/admin/users/:id/features`

设置功能权限。

#### POST `/api/admin/users/:id/force-logout`

强制下线。

#### POST `/api/admin/users/:id/unbind-device`

解绑设备。

#### GET `/api/admin/invites`

邀请码列表。

#### POST `/api/admin/invites`

创建邀请码。

#### GET `/api/admin/audit-logs`

操作日志。

## 8. 管理后台 UI V1

第一版做正规后台 UI，建议包含：

### 8.1 登录页

- 管理员邮箱。
- 密码。
- 登录失败提示。

### 8.2 总览仪表盘

指标：

- 总账号数。
- 活跃账号数。
- 试用账号数。
- 已到期账号数。
- 今日在线设备数。
- 本月应收金额。

### 8.3 账号管理

列表字段：

- 邮箱。
- 姓名。
- 状态。
- 订阅状态。
- 到期时间。
- 绑定设备。
- 最后在线。
- 操作。

操作：

- 禁用/恢复。
- 强制下线。
- 延长订阅。
- 修改套餐。
- 修改功能权限。
- 解绑设备。
- 重置密码。

### 8.4 邀请码管理

功能：

- 创建邀请码。
- 设置可用次数。
- 设置试用天数。
- 设置过期时间。
- 查看使用记录。
- 禁用邀请码。

### 8.5 订阅管理

功能：

- 查看所有订阅。
- 按到期时间筛选。
- 手动续费。
- 暂停订阅。
- 恢复订阅。

### 8.6 功能权限管理

功能：

- 勾选账号可用功能。
- 设置免费版每日额度。
- 设置高级功能开关。

### 8.7 在线设备

功能：

- 查看当前在线账号。
- 查看设备名。
- 查看 IP 和最后心跳。
- 强制下线。
- 解绑设备。

### 8.8 操作日志

记录所有后台敏感操作：

- 创建账号。
- 禁用账号。
- 强制下线。
- 修改订阅。
- 修改权限。
- 解绑设备。
- 创建邀请码。

## 9. NewPulse 客户端改造

### 9.1 新增登录/注册页

客户端启动流程改为：

```text
启动 NewPulse
  ↓
读取本地 token
  ↓
没有 token → 显示登录/注册页
  ↓
有 token → 调用 /api/license/check
  ↓
授权有效 → 进入软件
  ↓
授权过期 → 免费版/锁定页
  ↓
账号禁用 → 锁定页
```

### 9.2 本地保存内容

本地保存：

- access token。
- refresh token。
- user id。
- device id。
- device secret。
- 最近一次授权缓存。

保存位置建议使用 Electron 安全存储或用户数据目录。

不要明文保存密码。

### 9.3 功能权限守卫

客户端需要统一方法：

```text
canUseFeature(featureKey)
```

所有核心入口都调用它：

- 菜单显示。
- 页面进入。
- API 调用。
- 按钮点击。

无权限时显示：

- 当前功能需要订阅。
- 当前账号无权限。
- 请联系管理员开通。

### 9.4 免费版额度

到期降级后：

- 每天可使用少量 AI 聊天。
- 每天可新增少量客户/知识。
- 超出后弹窗提示订阅。

额度以云端为准。

### 9.5 实时下线

客户端登录后连接 WebSocket。

收到 `force_logout` 或 `account_disabled`：

1. 停止核心后台任务。
2. 清除 token。
3. 关闭实时连接。
4. 跳转登录页或锁定页。
5. 显示原因。

## 10. 安全设计

### 10.1 密码安全

- 使用 bcrypt/argon2 哈希密码。
- 不保存明文密码。
- 登录失败需要限制频率。

### 10.2 Token 安全

- access token 短期有效。
- refresh token 可撤销。
- session 表记录 token hash。
- 后台强制下线时撤销 session。

### 10.3 管理后台安全

- 管理后台必须登录。
- 超级管理员才能操作账号和订阅。
- 敏感操作写入审计日志。
- 后续可加双因素验证。

### 10.4 Electron 反绕过建议

V1 不追求重度反破解，但必须做到：

- 核心 AI/API 权限走云端校验。
- 客户端启动必须校验授权。
- 本地授权缓存带服务端签名。
- 定时校验授权。
- WebSocket 实时下线。

后续增强：

- 代码混淆。
- 自动更新签名。
- 安装包签名。
- 授权签名校验。
- 防调试检测。

## 11. 合规与隐私边界

V1 云端只同步账号授权数据，不同步业务数据。

云端保存：

- 邮箱。
- 账号状态。
- 订阅状态。
- 功能权限。
- 设备指纹哈希。
- 登录时间。
- 后台操作日志。

云端不保存：

- 客户详细资料。
- 员工监督原始数据。
- 聊天正文。
- 键盘输入。
- 截屏图片。
- 本地知识库内容。

这可以降低第一版上线的隐私和合规压力。

## 12. 开发阶段计划

### 阶段 1：云后台项目骨架

目标：独立云后台能启动。

内容：

- 创建 `newpulse-cloud` 项目。
- Express 服务。
- SQLite 数据库。
- 基础 schema。
- 管理员种子账号。
- 后台登录页。

### 阶段 2：账号与邀请码

目标：用户可以通过邀请码注册。

内容：

- 管理员登录。
- 创建邀请码。
- 邮箱密码注册。
- 邮箱密码登录。
- JWT session。
- 密码哈希。

### 阶段 3：订阅与授权校验

目标：客户端能根据订阅状态决定能不能用。

内容：

- 订阅表。
- 到期时间。
- 免费版降级。
- 功能权限。
- `/api/license/check`。

### 阶段 4：设备绑定

目标：一个账号只能绑定一台电脑。

内容：

- 设备指纹。
- 首次绑定。
- 非绑定设备拒绝登录。
- 后台解绑设备。

### 阶段 5：实时强制下线

目标：后台一点，客户端立刻下线。

内容：

- WebSocket 服务。
- 在线设备列表。
- 强制下线接口。
- 客户端监听事件。
- 轮询兜底。

### 阶段 6：管理后台完善

目标：后台像正式产品。

内容：

- 仪表盘。
- 账号管理。
- 邀请码管理。
- 订阅管理。
- 功能权限。
- 在线设备。
- 操作日志。

### 阶段 7：NewPulse 客户端接入

目标：下载安装后必须登录授权。

内容：

- 登录页。
- 注册页。
- token 保存。
- 启动授权校验。
- 功能权限守卫。
- 免费版额度提示。
- 锁定页。
- 实时下线。

## 13. V1 最小可上线标准

至少满足：

- 管理员能登录后台。
- 管理员能创建邀请码。
- 用户能邀请码注册。
- 用户能登录客户端。
- 一个账号只能绑定一台电脑。
- 管理员能设置账号到期时间。
- 到期后客户端降级免费版。
- 管理员能禁用账号。
- 禁用账号后客户端不能继续使用。
- 管理员能强制下线。
- 客户端能立即响应强制下线。
- 所有敏感后台操作有日志。

## 14. 推荐下一步

建议下一步开始实施：

1. 新建独立项目 `newpulse-cloud`。
2. 搭建 Express + SQLite 后端。
3. 创建数据库 schema。
4. 创建超级管理员账号。
5. 做管理后台登录页和基础布局。
6. 实现邀请码、注册、登录、授权校验 API。

不要一开始接微信/支付宝支付，也不要一开始同步客户和监督业务数据。先把商业授权闭环跑通。

## 15. 版本边界

V1 做：

- 云端账号。
- 邀请码注册。
- 手动订阅。
- 设备绑定。
- 功能权限。
- 实时强制下线。
- 正规后台 UI。

V1 不做：

- 自动支付。
- 云端业务数据同步。
- 复杂公司组织协作。
- 高强度反破解。
- 手机短信登录。
- 多端同步。

这些放到 V2/V3。
