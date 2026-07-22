---
kind: logging_system
name: 日志系统：基于原生 console 的轻量输出
category: logging_system
scope:
    - '**'
source_files:
    - apps/server/src/index.ts
    - apps/server/src/mcp/connection-manager.ts
    - scripts/mock-mcp-server.ts
---

本仓库未引入任何第三方日志框架，后端与脚本全部使用 Node.js 原生的 `console.log` / `console.warn` / `console.error` / `console.info` 进行输出。具体表现如下：

- **无日志库依赖**：`apps/server/package.json`、顶层 `package.json` 均未声明 pino、winston、bunyan、debug、loglevel 等日志包。
- **散点式调用**：日志分布在多个文件，如 `apps/server/src/index.ts`（服务启动/错误）、`apps/server/src/mcp/connection-manager.ts`（连接生命周期）、`scripts/mock-mcp-server.ts`（Mock 服务），没有统一的 logger 模块或中间件。
- **无结构化字段**：所有输出均为拼接字符串，不包含 JSON 结构化的时间戳、traceId、请求 ID、上下文对象等字段。
- **无级别管理**：仅通过不同 `console.*` 方法区分信息/警告/错误，没有可配置的日志级别开关。
- **无统一 sink**：未将日志重定向到文件、远程收集器或容器标准输出之外的目标；在 Docker 部署场景下直接输出到 stdout/stderr。

由于缺乏集中式日志基础设施，当前日志能力仅满足本地调试与简单排障需求，不具备生产级可观测性（无法按 trace 串联、无法动态调整级别、无法结构化检索）。