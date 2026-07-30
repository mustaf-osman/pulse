<p align="center">
  <picture>
    <source srcset="build/logo-pulse-dark.svg" media="(prefers-color-scheme: dark)" />
    <img src="build/logo-pulse-light.svg" alt="Pulse Logo" width="200" />
  </picture>
</p>

<h1 align="center">Pulse</h1>

<p align="center">
  <strong>A Continuously Running AI Digital Consciousness Framework</strong><br/>
  Memory · Thought · Action — Not just chat, but a persistently existing AI agent
</p>

<p align="center">
  <a href="https://github.com/mustaf-osman/pulse/releases"><img src="https://img.shields.io/github/v/release/mustaf-osman/pulse?style=flat-square" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android-lightgrey?style=flat-square" alt="Platform" /></a>
  <a href="#"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square" alt="Node" /></a>
</p>

---

> English | [中文](./README.md)

## What is Pulse?

**Pulse** (product name: Nimo Reminder Assistant) is not a traditional Q&A chatbot.

It is a **continuously running AI agent framework** — driven by a TICK clock, autonomously thinking during idle time, and instantly responding to external messages. Built with a memory system, context awareness, web dashboard, hardware companion (ESP32), and multi-platform social integration.

> Imagine: your AI assistant isn't a tool waiting to be woken up, but a **digital presence that's always online, has memory, and proactively cares about you**.

## Core Features

| Feature | Description |
|---------|-------------|
| TICK-Driven Loop | Continuous runtime, not single-turn API calls |
| Dual-Layer Thinking | Layer 1 fast response + Layer 2 deep processing |
| SQLite Persistence | Memory, conversations, config, tasks — all survive restarts |
| Smart Memory System | Auto-recognition, deduplication, semantic search |
| Web Dashboard | Brain UI — real-time mind state, memory streams, thought process |
| Multi-Platform Social | WeChat (personal), Discord, Feishu, WeCom |
| Multi-Device | Windows/macOS desktop + Android + ESP32 hardware companion |
| Industry Knowledge | 15+ pre-built industry knowledge packs |
| Voice I/O | Speech recognition (Whisper) + Text-to-Speech |
| Enterprise Features | CRM, follow-up reminders, industry radar, activity tracking |

## Quick Start

### End Users

Download from [Releases](https://github.com/mustaf-osman/pulse/releases), install, and launch.

### Developers

```bash
git clone https://github.com/mustaf-osman/pulse.git
cd pulse
npm install
cp .env.example .env   # Edit with your API key
npm start              # Electron desktop (recommended)
```

Open `http://127.0.0.1:3721/brain-ui` to access the Brain UI.

### Supported LLM Providers

| Provider | Default Model | Config Value |
|----------|---------------|--------------|
| MiniMax | MiniMax-M2.7 | minimax |
| DeepSeek | deepseek-reasoner | deepseek |
| OpenAI | gpt-5.4 | openai |

## Project Structure

```
pulse/
├── src/                     # Core source
├── electron/                # Electron desktop
├── cloud-hub/               # Cloud relay server
├── firmware/                # ESP32-S3 firmware
├── android-app/             # Android mobile app
├── scripts/                 # Helper scripts
├── doc/                     # Documentation
└── images/                  # Assets
```

## License

MIT — see [LICENSE](./LICENSE).
