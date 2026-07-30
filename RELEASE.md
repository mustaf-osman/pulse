# Pulse Windows 发布流程（阿里云 OSS 通道）

## 当前版本

- `0.1.0`

## 发布通道

- Provider: `generic`
- URL：`https://agent2.oss-cn-beijing.aliyuncs.com/pulse/`
- 以后要换 bucket 或 region，只需修改：`package.json -> build.publish[0].url`
- OSS bucket 内的对象布局：

```
agent2/                              # OSS bucket名
└── pulse/
    ├── latest.yml                   # electron-updater 读这个判新版
    ├── Pulse-Setup-0.1.0.exe        # 最新安装包
    └── Pulse-Setup-0.1.0.exe.blockmap # 差量更新用
```

## 为什么选这个方案

- OSS 默认域名（`*.aliyuncs.com`）**不需要备案**就能直接下载
- 自带 HTTPS，国内各运营商速度都不错
- 多人同时下载不会被轻量服务器带宽卡住
- 费用极低，你这个量级一个月不超过 10 块
- 等 `agent1.xin` 备案下来后，绑为自定义域名，只要改一行 URL 重发即可

## 本次发布包含

- Windows NSIS 安装包（未签名，可下载、可自动更新）
- 自动更新元数据 `latest.yml`
- 首次启动激活流程
- 卸载会清空 `%APPDATA%\Pulse`
- 安装器素材：
  - `build/icon.ico`
  - `build/installerHeaderIcon.ico`
  - `build/installerSidebar.bmp`
  - `build/uninstallerSidebar.bmp`

## 本地打包

```powershell
cd G:\TaPa
npm install
npm run build
```

产物：

- `G:\TaPa\dist\Pulse-Setup-0.1.0.exe`
- `G:\TaPa\dist\Pulse-Setup-0.1.0.exe.blockmap`
- `G:\TaPa\dist\latest.yml`

## 本地验证清单

1. 安装 `Pulse-Setup-0.1.0.exe`。
2. 启动应用，确认首次出现激活页。
3. 输入正确 API key，确认进入 `brain-ui`。
4. 卸载应用。
5. 重新安装，确认仍需激活。
6. 激活后，确认模型预热期间输入框临时禁用。

## 上线前的一次性准备

### 1. bucket 设为公共读

OSS 控制台 → 进入 `agent2` bucket → **权限控制** → **读写权限** → 改为 **公共读**。
它只会开放下载，不会开放列目录和上传，安全。

### 2. 安装 ossutil（阿里云官方 CLI）

下载页：https://help.aliyun.com/zh/oss/developer-reference/install-ossutil

选 Windows 64位，解压后任选一种：

- 把 `ossutil.exe` 放进系统 PATH（例如 `C:\Windows\` 或加进环境变量）
- 或者直接放到 `G:\TaPa\scripts\ossutil.exe`（脚本会优先用这里的）

### 3. 创建 AccessKey

阿里云控制台 → 右上角头像 → **AccessKey 管理** → **创建 AccessKey**。
记下 `AccessKey ID` 和 `AccessKey Secret`（Secret 只能看一次，别关页）。

> 推荐后续去 RAM 创建一个只有 OSS 权限的子账号，主账号 AccessKey 太危险。现阶段先用主账号跑通也行。

### 4. 配置 ossutil

本机终端运行：

```powershell
ossutil config
```

依次填：

- `endpoint`：`https://oss-cn-beijing.aliyuncs.com`
- `accessKeyID`：刚刚记下的 ID
- `accessKeySecret`：刚刚记下的 Secret
- 其他项回车跳过

配置文件会存在 `~/.ossutilconfig`，不要提交进 git。

## 一键发布到 OSS

```powershell
npm run build          # 在 dist/ 下生成 .exe / .blockmap / latest.yml
npm run release:oss    # 上传这三个文件到 OSS
```

脚本：`scripts/release-oss.ps1`。它会：

- 从 `package.json` 读 `version` 和 `productName` 拼出产物名
- 按顺序上传：`.exe` → `.blockmap` → `latest.yml`（最后传元数据，避免老用户拉到指向不存在的 .exe）
- 默认 bucket=`agent2`、prefix=`pulse/`，要改设环境变量：

```powershell
$env:PULSE_OSS_BUCKET = "你的bucket名"
$env:PULSE_OSS_PREFIX = "你的路径前缀/"
npm run release:oss
```

## 验证是否上线

浏览器打开两个链接：

```
https://agent2.oss-cn-beijing.aliyuncs.com/pulse/latest.yml
https://agent2.oss-cn-beijing.aliyuncs.com/pulse/Pulse-Setup-0.1.0.exe
```

两个能下载下来就 OK。已装老版的用户下次启动会自动检测并下载新版。

## 备案后如何接自定义域名

`agent1.xin` 备案下来后：

1. OSS 控制台 → `agent2` bucket → **传输管理** → **域名管理** → **绑定自定义域名**。
2. 填 `download.agent1.xin` （或你愿意的子域）。
3. 控制台会要求你加 CNAME 记录跳到 `agent2.oss-cn-beijing.aliyuncs.com`。
4. 在同一页面申请 SSL 证书（免费）并启用 HTTPS。
5. 改 `package.json` 里的 url 为 `https://download.agent1.xin/pulse/`，重新 `npm run build && npm run release:oss`。

## 关于未签名安装包

本通道是未签名版本，用户在 Windows 上首次运行会看到 SmartScreen 提示「未知发布者」，点击「更多信息 -> 仍要运行」即可。

要降低用户疑虑：

- 在下载页给出运行指引截图。
- 让用户从你的官方域名下载，不要二次转发到网盘。
- 想长期消除提示，最终方案还是买代码签名证书。

## 版本升级 Checklist

1. 修改 `package.json` 的 `version`。
2. `npm install` 更新 `package-lock.json`。
3. `npm run build` 生成新的 `dist/` 产物。
4. 本机验证：安装 / 激活 / 卸载 / 重装。
5. 把 `*.exe`、`*.exe.blockmap`、`latest.yml` 一起上传覆盖到服务器 `pulse/` 目录。
6. 找一台装着旧版的电脑确认能自动检测并安装新版。
