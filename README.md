# MCP Tool Debug — 开源 MCP Inspector 与自动化测试工作台

[简体中文](README.md) | [English](README.en.md)

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](package.json)
[![MCP SDK](https://img.shields.io/badge/Model%20Context%20Protocol-SDK-6f42c1)](https://modelcontextprotocol.io/)
[![JSON Schema 2020-12](https://img.shields.io/badge/JSON%20Schema-2020--12-blue)](https://json-schema.org/draft/2020-12)
[![GitHub stars](https://img.shields.io/github/stars/tushengtao/mcp-tool-debug?style=flat&logo=github)](https://github.com/tushengtao/mcp-tool-debug)

**MCP Tool Debug** 是一个可自托管的 Web 调试台，用于连接、检查、调用和自动化测试 [Model Context Protocol（MCP）](https://modelcontextprotocol.io/) Tools。它把 MCP Inspector、JSON Schema 2020-12 动态表单、结果诊断、测试用例和回归执行集中到同一个界面中。

> 从“这个 Tool 为什么调用失败？”到“这批 MCP Tools 升级后是否仍然可用？”，在一个工作台里完成定位和验证。

## 为什么需要它？

开发或接入 MCP Server 时，真正耗时的往往不是发送一次 JSON-RPC 请求，而是反复处理这些问题：

| 痛点 | MCP Tool Debug 如何处理 |
| --- | --- |
| `inputSchema` 很复杂，手写 JSON 容易漏字段 | 根据 JSON Schema 2020-12 生成表单，支持 `oneOf`、`anyOf`、嵌套对象和数组，同时保留 JSON 编辑模式 |
| HTTP、JSON-RPC、Tool `isError` 混在一起 | 区分协议/连接错误、Tool 执行错误、超时和 Schema 校验错误 |
| `content`、`structuredContent` 和 `outputSchema` 难以一起检查 | 同时展示 Markdown、图片、音频、结构化 JSON、原始响应和输出 Schema 校验结果 |
| 调通一次后无法稳定复现 | 将参数保存为测试用例，配置断言，并批量执行回归测试 |
| 远程 Streamable HTTP Session 会过期 | 遵循 MCP 会话规范，在 Session 404 时重新初始化并安全重试一次 |
| 团队环境需要共享和持久化 | 支持连接/用例导入导出，默认 SQLite，也可切换 PostgreSQL |

## 适用场景

- **MCP Server 开发**：在提交代码前快速验证 Tool Schema、参数、返回内容和错误语义。
- **MCP Client / Agent 集成**：排查 Streamable HTTP、SSE、Headers、超时和会话生命周期问题。
- **QA 与回归测试**：把手工调试参数沉淀为断言用例，批量验证多个 Tools。
- **团队共享测试环境**：通过 Docker 和 PostgreSQL 部署一个统一的 MCP 调试入口。
- **Schema 兼容性验证**：检查 JSON Schema 2020-12、`oneOf`、`anyOf`、`required` 和 `outputSchema`。

## 功能亮点

- 多 MCP 连接管理，支持自定义 Headers、连接超时和在线状态。
- Streamable HTTP、SSE 和 `auto` 回退模式。
- 同步、搜索和查看 Tools 的原始 Schema。
- RJSF 6 + Ajv 2020 驱动的动态表单，也可直接编辑 JSON 参数。
- 清晰区分协议错误、Tool `isError`、超时、断言失败和输出 Schema 错误。
- 展示 `content`、`structuredContent`、原始响应、调用起止时间和耗时。
- 保存、编辑、启停和批量运行测试用例。
- 支持内容包含/排除、JSONPath、耗时、结构化输出和 Schema 有效性断言。
- 记录单次调用与测试套件历史，便于定位回归问题。
- SQLite / PostgreSQL 双数据库支持。
- 基于 `node:22-alpine` 的 Docker Compose 部署。
- 常规连接 API 不返回 Authorization 等 Header 值，减少凭据意外泄露。

## 文档导航

- [UI 设计规范](docs/ui-design.md)：界面信息架构、亮暗主题、组件与交互标准。
- [Docker 部署说明](deployment/README.md)：SQLite / PostgreSQL 与容器化部署。
- [贡献指南](CONTRIBUTING.md)：开发流程、测试与 Pull Request 约定。
- [安全策略](SECURITY.md)：漏洞报告与凭据保护要求。
- [English README](README.en.md)：英文项目介绍与使用说明。

## 快速开始

要求：**Node.js 20+**。本地开发无需与 Docker 镜像使用相同的 Node 主版本。

```bash
git clone https://github.com/tushengtao/mcp-tool-debug.git
cd mcp-tool-debug
npm install
npm run dev
```

`better-sqlite3` 包含原生二进制。切换 Node 主版本后，请在新版本下重新执行
`npm install`，或运行 `npm run rebuild:native`；不要复用由另一 Node 主版本生成的
`node_modules`。Docker 会在 `node:22-alpine` 镜像内独立安装依赖，不受本机版本影响。

启动后访问：

- Web UI：<http://localhost:5173>
- API 健康检查：<http://localhost:8787/api/health>

也可以分别启动：

```bash
npm run dev:server
npm run dev:web
```

## Docker 部署

镜像使用 `node:22-alpine` 构建 API，Web 静态文件由 Nginx 提供。

```bash
cp deployment/.env.example deployment/.env
cd deployment
chmod +x deploy.sh
./deploy.sh up
```

管理命令：

```bash
./deploy.sh status
./deploy.sh logs
./deploy.sh restart
./deploy.sh down
```

更多信息见 [Docker 部署说明](deployment/README.md)。

## PostgreSQL 配置

默认使用 SQLite。生产或团队环境可在 `deployment/.env` 中改为 PostgreSQL：

```dotenv
# 停用默认 SQLite 配置：
# DATABASE_URL=file:./data/mcp-debug.db
# DB_DIALECT=sqlite

# PostgreSQL 示例；数据库需要提前创建并允许 API 容器访问。
DATABASE_URL=postgresql://username:password@host.docker.internal:5432/mcp_debug
DB_DIALECT=postgres
```

用户名或密码中的 `@`、`#` 等特殊字符必须进行 URL 百分号编码，例如 `p@ss#word` 应写为 `p%40ss%23word`。

## 使用流程

1. 在“连接”页面新增 Streamable HTTP 或 SSE MCP 地址。
2. 点击“连接”和“同步 Tools”。
3. 进入工作台，选择 Tool，通过表单或 JSON 填写参数。
4. 调用 Tool，检查协议状态、耗时、`content`、`structuredContent` 和 Schema 校验。
5. 将有效参数另存为用例，并配置断言。
6. 在“自动化”页面按连接、Tool、标签或用例批量执行回归测试。

## 支持的断言

```json
{
  "expectIsError": false,
  "expectStructured": true,
  "structuredEquals": { "ok": true },
  "structuredSchemaValid": true,
  "contentTextContains": ["success"],
  "contentTextNotContains": ["error"],
  "maxDurationMs": 3000,
  "jsonPathEquals": [{ "path": "$.code", "value": 0 }]
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PORT` | 后端 API 端口 | `8787` |
| `DATABASE_URL` | SQLite 文件或 PostgreSQL URL | `file:./data/mcp-debug.db` |
| `DB_DIALECT` | `sqlite` / `postgres`，未设置时根据 URL 推断 | 自动推断 |
| `CORS_ORIGIN` | 允许访问 API 的 Web Origin | `http://localhost:5173` |

## 架构

```mermaid
flowchart LR
    Browser["React Web Workbench"] --> API["Hono API"]
    API --> Client["MCP TypeScript Client"]
    Client --> MCP["MCP Server<br/>Streamable HTTP / SSE"]
    API --> DB[("SQLite / PostgreSQL")]
```

技术栈：React 18、Ant Design 5、RJSF 6、Ajv 8、CodeMirror、Hono、MCP TypeScript SDK、Drizzle ORM、SQLite、PostgreSQL 和 Docker Compose。

## 安全提示

- 连接 Headers 可能包含 Authorization、Cookie 或 API Key。常规连接 API 只返回 Header 名称，不返回值。
- 导出文件会包含完整连接凭据，请只保存到可信位置，且不要提交到 Git。
- 面向公网部署前，请在反向代理层增加 HTTPS、身份认证、访问控制和速率限制。
- 安全问题请阅读 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中粘贴真实令牌或私有地址。

## 路线图

- [x] Streamable HTTP / SSE 连接与 Tool 调用
- [x] JSON Schema 2020-12 表单与输出校验
- [x] 测试用例、断言、批量执行与历史记录
- [x] SQLite / PostgreSQL 与 Docker 部署
- [ ] stdio Transport
- [ ] 面向 CI 的无头命令行执行器
- [ ] 更细粒度的团队权限与凭据管理

欢迎通过 Issue 讨论优先级，也欢迎直接贡献实现。

## 参与贡献

Bug 报告、MCP Server 兼容性案例、文档改进和 Pull Request 都很有价值。开始之前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

提交代码前运行：

```bash
npm run test:server
npm run build:server
npm run build:web
```

## License

本项目基于 [MIT License](LICENSE) 开源。

MCP Tool Debug 是社区项目，与 Model Context Protocol 官方或 Anthropic 无隶属关系。
