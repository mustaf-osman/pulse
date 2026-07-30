# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Report it privately to the project maintainers. We take all reports seriously.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Best Practices

1. Never commit `.env` or `config.json` files containing API keys
2. Pulse binds to `127.0.0.1:3721` by default — do not expose to public internet
3. Cloud Hub should run behind a reverse proxy with HTTPS
4. Use `private_config.example.h` as template — never commit `private_config.h`
