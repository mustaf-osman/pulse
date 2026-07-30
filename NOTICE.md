# Pulse NOTICE

Pulse是基于开源项目 Pulse 二次开发的 AI Agent 产品版本。

## 原始项目

- 项目名称：Pulse
- 原作者：xiaoyuanda666-ship-it
- 原始仓库：https://github.com/xiaoyuanda666-ship-it/Pulse
- 开源协议：MIT License

## 版权与许可

原始 Pulse 代码遵循 MIT License，相关版权声明保留在 `LICENSE` 文件中。

Pulse项目中的新增品牌、图标、产品化改造、业务功能和后续新增代码由Pulse项目团队维护。

## 分发说明

分发Pulse安装包或源码时，应保留：

- `LICENSE`
- `NOTICE.md`

## 安全说明

Pulse当前默认启用产品安全模式：

- 默认禁用 `exec_command`、`delete_file`、`kill_process` 等本地高危工具。
- 默认禁用 `/admin/reset-memories`、`/admin/reset-files` 等重置接口。
- 如需本地开发调试，可通过显式环境变量开启相关能力。
