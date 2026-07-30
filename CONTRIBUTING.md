# Contributing to Pulse

Thank you for your interest in contributing to Pulse!

## Development Setup

```bash
git clone https://github.com/mustaf-osman/pulse.git
cd pulse
npm install
npm run dev
```

## Branch Strategy

- `main` — stable, always releasable
- `feat/*` — new features
- `fix/*` — bug fixes
- `docs/*` — documentation updates

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add ESP32 BLE support
fix: memory leak in TICK scheduler
docs: update API reference
refactor: extract LLM provider interface
ci: add Windows build workflow
```

## Code Style

- JavaScript (ES Modules)
- Indentation: 2 spaces
- Strings: single quotes
- Naming: camelCase (vars/functions), PascalCase (classes)

## Pull Request Process

1. Fork the repository
2. Create your branch from `main`
3. Write code + test locally (`npm start`)
4. Ensure no new warnings
5. Submit PR to `main`
6. Wait for review

## Need Help?

- Browse [Issues](https://github.com/mustaf-osman/pulse/issues)
- Read [Documentation](./doc/)
