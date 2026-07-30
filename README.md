<p align="center">
  <picture>
    <source srcset="build/logo-pulse-dark.svg" media="(prefers-color-scheme: dark)" />
    <img src="build/logo-pulse-light.svg" alt="Pulse Logo" width="200" />
  </picture>
</p>

<h1 align="center">Pulse</h1>

<p align="center">
  <strong>持续运行的 AI 数字意识框架</strong><br/>
  记忆 · 思考 · 行动 —— 不只是聊天，而是持续存在的 AI 代理
</p>

<p align="center">
  <a href="https://github.com/mustaf-osman/pulse/releases"><img src="https://img.shields.io/github/v/release/mustaf-osman/pulse?style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square" alt="Platform" /></a>
  <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node" /></a>
  <a href="https://github.com/mustaf-osman/pulse/stargazers"><img src="https://img.shields.io/github/stars/mustaf-osman/pulse?style=flat-square" alt="Stars" /></a>
</p>

---

## 这是什么？

**Pulse**（产品名：Nimo 提醒助手）不是传统的"你问一句我答一句"的聊天机器人。

它是一个**持续运行的 AI 代理框架**——以 TICK 时钟驱动，在空闲时自主思考，在有外部消息时即时响应。内置记忆系统、上下文感知、Web 控制面板、硬件伴侣（ESP32），支持多平台社交接入。

> 想象一下：你的 AI 助手不是一个等待唤醒的工具，而是一个**永远在线、有记忆、会主动关心你**的数字存在。

## 核心特性

| 特性 | 说明 |
|------|------|
| TICK 驱动循环 | 不是单次调用，而是持续运行的主循环 |
| 双层思考架构 | Layer1 快速响应 + Layer2 深度处理 |
| SQLite 持久化 | 记忆、对话、配置、任务全部落盘，重启不丢失 |
| 智能记忆系统 | 自动识别、去重、注入相关记忆，支持语义搜索 |
| Web 控制面板 | Brain UI 实时查看脑内状态、记忆流、思维过程 |
| 多社交平台 | 微信（个人号）、Discord、飞书、企业微信 |
| 多端覆盖 | Windows/macOS 桌面 + Android 手机 + ESP32 硬件伴侣 |
| 行业知识包 | 预置 15+ 行业领域知识（电商、教育、法律、餐饮...） |
| 语音交互 | 支持语音输入（Whisper）和语音合成（TTS） |
| 企业级功能 | 客户管理、跟进提醒、行业雷达、活动追踪 |

## 架构概览

```
                            ┌─────────────────────────────┐
                            │       Brain UI (Web)         │
                            │  思维流 · 记忆 · 客户 · 设备  │
                            └─────────────┬───────────────┘
                                          │ SSE / HTTP API
┌──────────┐  ┌──────────┐  ┌─────────────▼───────────────┐  ┌──────────┐
│  WeChat   │  │ Discord  │  │                             │  │  Feishu  │
│ (个人号)  │  │          │  │       Pulse Core            │  │          │
└─────┬─────┘  └────┬─────┘  │                             │  └────┬─────┘
      │             │        │  ┌───────────────────────┐  │       │
      └──────┬──────┴────────┤  │  TICK Scheduler       │  ├───────┘
             │               │  │  ┌─────┐  ┌─────────┐ │  │
             ▼               │  │  │L1 快│  │L2 深度  │ │  │
      ┌──────────┐           │  │  │速响应│  │思考处理 │ │  │
      │  Message │           │  │  └──┬──┘  └────┬────┘ │  │
      │  Queue   │           │  │     │          │      │  │
      └────┬─────┘           │  │     ▼          ▼      │  │
           │                 │  │  ┌─────────────────┐  │  │
           ▼                 │  │  │   LLM Provider   │  │  │
      ┌──────────┐           │  │  │ MiniMax/DeepSeek │  │  │
      │  Memory  │◄──────────┤  │  │     /OpenAI      │  │  │
      │  System  │           │  │  └─────────────────┘  │  │
      └────┬─────┘           │  └───────────────────────┘  │
           │                 │                             │
           ▼                 │  ┌──────────┐ ┌──────────┐  │
      ┌──────────┐           │  │ SQLite   │ │ Sandbox  │  │
      │ Task     │           │  │ 记忆/对话 │ │ 文件系统 │  │
      │ Manager  │           │  └──────────┘ └──────────┘  │
      └──────────┘           └─────────────┬───────────────┘
                                           │
                        ┌──────────────────┼──────────────────┐
                        │                  │                  │
                  ┌─────▼─────┐    ┌──────▼──────┐   ┌──────▼──────┐
                  │  ESP32-S3  │    │ Cloud Hub   │   │ Android App │
                  │  硬件伴侣   │    │  云端中继    │   │  移动端     │
                  └───────────┘    └─────────────┘   └─────────────┘
```

## 快速开始

### 普通用户

从 [Releases](https://github.com/mustaf-osman/pulse/releases) 下载安装包，双击安装：

1. 启动 **Nimo 提醒助手**（开始菜单 / 桌面快捷方式）
2. 首次启动自动进入激活页，粘贴 LLM API Key
3. 激活后自动进入 Brain UI，AI 开始持续运行

### 开发者

```bash
git clone https://github.com/mustaf-osman/pulse.git
cd pulse
npm install
cp .env.example .env   # 编辑填入你的 API Key
npm start              # Electron 桌面版（推荐）
```

启动后访问 `http://127.0.0.1:3721/brain-ui` 查看 Brain UI。

### 支持的 LLM Provider

| Provider | 默认模型 | 配置值 |
|----------|----------|--------|
| MiniMax | MiniMax-M2.7 | minimax |
| DeepSeek | deepseek-reasoner | deepseek |
| OpenAI | gpt-5.4 | openai |

## 项目结构

```
pulse/
├── src/                        # 核心源码
│   ├── index.js                # 主入口 — TICK 循环调度
│   ├── llm.js                  # LLM 调用封装
│   ├── db.js                   # SQLite 数据库操作
│   ├── api.js                  # HTTP API 服务
│   ├── memory/                 # 记忆系统（识别器 + 注入器）
│   ├── providers/              # LLM Provider 实现
│   ├── social/                 # 社交平台接入
│   ├── voice/                  # 语音识别 & 合成
│   ├── ui/brain-ui/            # Brain UI 前端组件
│   └── industry/               # 行业知识加载
├── electron/                   # Electron 桌面端主进程
├── cloud-hub/                  # 云端中继服务器
├── firmware/                   # ESP32-S3 固件
├── android-app/                # Android 移动端
├── scripts/                    # 辅助脚本
├── doc/                        # 产品 & 技术文档
└── images/                     # 图片资源
```

## 文档

- [产品理念](./ACI-理念文档.md) — 为什么做 Pulse
- [产品化路线图](./NIMO_PRODUCTIZATION_ROADMAP.md) — 版本规划
- [构建笔记](./BUILD-NOTES.md) — 打包 & 发布细节
- [发布说明](./RELEASE.md) — 版本变更记录

## API 参考

所有 API 默认监听 `http://127.0.0.1:3721`。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /message | 发送消息给 AI |
| GET | /events | SSE 实时事件流 |
| GET | /status | 运行状态 & 记忆统计 |
| GET | /memories | 查询 / 搜索记忆 |
| GET | /conversations | 查询对话历史 |
| PATCH | /memories/:id | 编辑记忆内容 |
| DELETE | /memories/:id | 删除记忆 |

### 示例

```bash
curl -X POST http://127.0.0.1:3721/message \
  -H "Content-Type: application/json" \
  -d '{"from_id":"Yuanda","content":"你好","channel":"API"}'

curl http://127.0.0.1:3721/status
```

## 贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解提交规范和开发流程。

- 报告 Bug: https://github.com/mustaf-osman/pulse/issues/new?template=bug_report.md
- 功能建议: https://github.com/mustaf-osman/pulse/issues/new?template=feature_request.md

## 许可证

本项目使用 [MIT License](./LICENSE)。

## 赞助

如果这个项目对你有帮助，欢迎赞助支持。

感谢以下赞助者：极客旋风、阿兵哥、钓鱼老1996、我不是牛马、AI布道大师

---

<p align="center">
  Made with ❤️ by Pulse 项目团队
</p>
