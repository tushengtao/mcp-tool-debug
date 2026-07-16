# MCP Tool 调试台

本地单机 MCP Tools 调试与自动化测试工具。

- 前端：React + Ant Design + RJSF + CodeMirror + react-markdown
- 后端：Node.js + Hono + `@modelcontextprotocol/sdk`
- 数据库：默认 SQLite，可通过 `DATABASE_URL` 切换 PostgreSQL
- 传输：Streamable HTTP / SSE / auto（不含 stdio）

## 功能

- 多 MCP 连接管理（Headers、超时、在线状态）
- Tools 同步与搜索
- JSON Schema 动态表单输入（默认 2020-12，Ajv2020）
- 结构化输出（CodeMirror）与非结构化 content（Markdown / 图片 / 音频）
- 每次调用记录发起时间、结束时间、耗时
- 测试用例、断言、套件批量执行
- 连接与用例导入导出

## 快速开始

要求：Node.js ≥ 20，pnpm ≥ 9

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/api/health

仅启动后端：

```bash
pnpm dev:server
```

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | API 端口 | `8787` |
| `DATABASE_URL` | `file:./data/mcp-debug.db` 或 `postgres://...` | SQLite 文件 |
| `DB_DIALECT` | `sqlite` / `postgres` | 从 URL 推断 |
| `CORS_ORIGIN` | 前端源 | `http://localhost:5173` |

## 使用流程

1. 打开「连接」页，新建 Streamable HTTP 或 SSE 地址
2. 点击「连接」→「同步 Tools」
3. 进入「工作台」，选择 Tool，用表单或 JSON 填参并调用
4. 查看耗时、structuredContent、content 与 outputSchema 校验
5. 「另存为用例」后可在「自动化」页批量跑

## 断言字段

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
