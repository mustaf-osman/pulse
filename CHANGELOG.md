# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-07-27

### Added
- Cloud Hub relay server (cloud-hub/)
- Android APK wrapper for mobile access
- macOS ARM64 build support
- ESP32-S3 minimal firmware template
- ESP32-S3 speaker test firmware
- Industry knowledge packs (15+ industries)
- Activity tracking (window sampler, screen analyzer)
- Person card and hotspot panels in Brain UI
- Company workspace sync
- Cloud authentication module
- Prefetch runner for proactive content loading

### Changed
- Rebranded from Pulse to Nimo (product name)
- Improved onboarding flow
- Restored top navigation (今日/客户/对话/跟进/数据/设置)
- Enhanced macOS packaging with proper icon generation

### Fixed
- Various Brain UI rendering issues
- Memory injector deduplication logic

## [0.1.3] - 2026-05-24

### Added
- Electron desktop shell
- Brain UI web dashboard
- Multi-provider LLM support (MiniMax, DeepSeek, OpenAI)
- TICK-driven main loop with dual-layer thinking
- SQLite persistence (memory, conversations, config)
- Memory system with recognizer and injector
- WeChat personal account integration (ClawBot)
- Discord webhook integration
- Voice I/O pipeline (Whisper ASR + TTS)
- NSIS Windows installer
- Auto-update via electron-updater

## [0.1.0] - 2026-05-11

### Added
- Initial release
- Core TICK loop
- Basic memory and context systems
- HTTP API with status/message endpoints
- Command-line backend mode
