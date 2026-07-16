# MCP Tool 调试工具实现计划

## Summary

从零构建一个**本地单机**的 MCP Tool 调试台：React 前端 + Node.js 后端，默认 SQLite，可通过环境变量切换 PostgreSQL。第一版**只做 Tools**，传输支持 **Streamable HTTP + 兼容 SSE**（不做 stdio）。输入用 RJSF 完整兼容 JSON Schema（默认 2020-12），输出区分结构化（CodeMirror JSON）与非结构化（react-markdown 等）。每个连接下可管理多个 Tool 的测试用例、调用历史（发起/结束时间与耗时）、结果保存与自动化回归测试。

相对官方 MCP Inspector 的差异化：持久化连接与用例、断言式自动化、输出双形态渲染、耗时与历史可追溯、团队可迁 PG。

## Current State Analysis

- 工作区 `f:\codex-space\mcp-tool-debug` **为空仓库**，无全新建项目。
- 协议要点（MCP Tools）：
  - 发现：`tools/list`（分页 `cursor`）
  - 调用：`tools/call`，参数为 `name` + `arguments`
  - 工具定义：`inputSchema` / 可选 `outputSchema`，默认 JSON Schema **2020-12**（无 `$schema` 时）
  - 结果：`content[]`（text/image/audio/resource_link/resource）+ 可选 `structuredContent` + `isError`
  - 错误：协议级 JSON-RPC error vs 工具级 `isError: true`
- 官方 Inspector：交互调试强，但**缺持久用例、自动化断言、历史耗时分析、结果库**。
- RJSF：用 `@rjsf/validator-ajv8`，需配置 Ajv2020 以识别 `https://json-schema.org/draft/2020-12/schema`。
- 数据库：Drizzle 双方言 schema 分文件 + repository 抽象；默认 better-sqlite3 / libsql，PG 用 `pg`。

## Goals / Non-Goals

### Goals（v1）

1. 管理多个 MCP 连接（HTTP/SSE），连接状态可视化。
2. 列出 Tool，展示 schema/描述，RJSF 动态表单调用。
3. 双输出：`structuredContent` → CodeMirror；`content` text/markdown → react-markdown；image/audio 内联预览。
4. 每 Tool 多测试用例；调用自动记 `startedAt` / `endedAt` / `durationMs`。
5. 结果可保存、对比、导出；用例可跑自动化（含期望断言）。
6. SQLite 默认 + PostgreSQL 适配。

### Non-Goals（v1 明确不做）

- stdio 本地子进程 MCP
- Resources / Prompts 完整 UI（仅预留数据模型/路由位）
- 多用户鉴权、OAuth 完整授权流（仅支持自定义 Headers / Bearer 静态配置）
- 复杂 CI 插件市场（可提供 HTTP API 供外部调用）

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Web UI (React + Vite + TypeScript)                         │
│  Connections │ Tools │ RJSF Form │ Result Pane │ Cases/Runs │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST (+ 可选 SSE 进度)
┌───────────────────────────▼─────────────────────────────────┐
│  API Server (Node.js + Fastify/Hono + TypeScript)           │
│  ConnectionManager │ McpClientPool │ CaseRunner │ Validator │
└───────────┬─────────────────────────────┬───────────────────┘
            │ @modelcontextprotocol/sdk   │ Drizzle ORM
            ▼                             ▼
   Streamable HTTP / SSE          SQLite (default) | PostgreSQL
```

### 关键设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 包结构 | pnpm monorepo：`apps/web`、`apps/server`、`packages/shared` | 共享类型与断言 schema |
| HTTP 框架 | **Hono**（Node adapter） | 轻量、类型好、易挂静态前端 |
| MCP SDK | `@modelcontextprotocol/sdk` Client + `StreamableHTTPClientTransport`，失败回退 `SSEClientTransport` | 与官方一致 |
| 表单 | `@rjsf/core` + `@rjsf/antd` 或 shadcn 主题 + `@rjsf/validator-ajv8`（Ajv2020） | 用户指定 RJSF + 2020-12 |
| JSON 查看 | `@uiw/react-codemirror` + json lang | 用户指定 CodeMirror |
| Markdown | `react-markdown` + `remark-gfm` | 非结构化展示 |
| ORM | Drizzle + 双 schema + repository | SQLite/PG 适配 |
| 连接池 | 服务端进程内 Map：connectionId → live Client | 避免每次 call 全量握手（可配置） |
| 密钥 | headers/token 存库；可选简单加密（环境变量 `SECRET_KEY`） | 本地调试够用 |

## Data Model

### `mcp_connections`

- `id` (uuid/text PK)
- `name`, `description?`
- `transport`: `streamable_http` | `sse` | `auto`
- `url`
- `headers_json` (JSON text)
- `timeout_ms` default 60000
- `enabled` boolean
- `last_connected_at?`, `last_error?`
- `server_info_json?` (name/version/capabilities 缓存)
- `created_at`, `updated_at`

### `mcp_tools`（某次 sync 的快照，按连接）

- `id`, `connection_id` FK
- `name` (unique per connection)
- `title?`, `description?`
- `input_schema_json`, `output_schema_json?`
- `annotations_json?`, `raw_json`
- `synced_at`

### `test_cases`

- `id`, `connection_id`, `tool_name`
- `name`, `description?`
- `arguments_json`
- `assert_json`（见下）
- `tags_json?`, `enabled`
- `created_at`, `updated_at`

**assert_json 结构（v1）**

```json
{
  "expectIsError": false,
  "expectStructured": true,
  "structuredEquals": { "optional": "partial or full object" },
  "structuredSchemaValid": true,
  "contentTextContains": ["ok"],
  "contentTextNotContains": [],
  "maxDurationMs": 5000,
  "jsonPathEquals": [{ "path": "$.temperature", "value": 22.5 }]
}
```

### `invocation_runs`（单次调用，手动或自动化）

- `id`
- `connection_id`, `tool_name`
- `test_case_id?`（手动调用可空）
- `suite_run_id?`
- `source`: `manual` | `case` | `suite`
- `request_arguments_json`
- `started_at`, `ended_at`, `duration_ms`
- `status`: `success` | `tool_error` | `protocol_error` | `timeout` | `cancelled`
- `is_error` boolean
- `result_content_json`, `result_structured_json?`
- `protocol_error_json?`
- `assert_result_json?`（通过/失败明细）
- `schema_validation_json?`（对 outputSchema 校验结果）
- `raw_response_json?`
- `created_at`

### `suite_runs`（批量自动化）

- `id`, `connection_id?`（可跨 tool 同连接）
- `name?`, `filter_json?`
- `started_at`, `ended_at`, `duration_ms`
- `total`, `passed`, `failed`, `skipped`
- `status`: `running` | `passed` | `failed` | `cancelled`
- `created_at`

### 索引

- `(connection_id, tool_name)` on tools/cases/runs
- `started_at` on runs
- `suite_run_id` on runs

## API 设计（REST）

前缀 `/api`

| Method | Path | 说明 |
|--------|------|------|
| GET/POST | `/connections` | 列表/创建 |
| GET/PATCH/DELETE | `/connections/:id` | 详情/更新/删除 |
| POST | `/connections/:id/connect` | 建立/刷新会话，写 serverInfo |
| POST | `/connections/:id/disconnect` | 关闭会话 |
| POST | `/connections/:id/sync-tools` | `tools/list` 全量分页拉取并 upsert |
| GET | `/connections/:id/tools` | 读库列表（可带 q 搜索） |
| GET | `/connections/:id/tools/:toolName` | 工具详情 |
| POST | `/connections/:id/tools/:toolName/invoke` | 手动调用；body: `{ arguments, save?: true, testCaseId? }` |
| GET/POST | `/connections/:id/tools/:toolName/cases` | 用例 CRUD 列表/创建 |
| PATCH/DELETE | `/cases/:id` | 更新/删除用例 |
| POST | `/cases/:id/run` | 跑单用例 |
| POST | `/connections/:id/suites/run` | 批量：`{ toolNames?, caseIds?, tags?, parallel?:1 }` |
| GET | `/suite-runs/:id` | 套件进度与汇总 |
| GET | `/runs` | 历史过滤：connection/tool/status/time |
| GET | `/runs/:id` | 单次详情 |
| DELETE | `/runs/:id` | 删除历史 |
| GET | `/export` | 导出连接+用例 JSON |
| POST | `/import` | 导入 |

**Invoke 响应统一形状**

```json
{
  "runId": "...",
  "startedAt": "ISO",
  "endedAt": "ISO",
  "durationMs": 123,
  "status": "success",
  "isError": false,
  "content": [],
  "structuredContent": {},
  "schemaValidation": { "ok": true, "errors": [] },
  "assertResult": null
}
```

## Frontend IA（信息架构）

1. **连接页** `/connections`：卡片列表、新建（URL/transport/headers）、连接/断开/同步 Tools、最后错误。
2. **工作台** `/connections/:id/tools`：
   - 左：Tool 列表（搜索、同步时间）
   - 中：选中 Tool → Tabs：`调用` | `用例` | `历史` | `Schema`
   - **调用 Tab**：RJSF 表单 + Raw JSON 切换；Invoke；超时展示
   - **结果区**（右侧或下方 Tabs）：
     - Structured（CodeMirror 只读 + 复制）
     - Content（按 type 渲染：text→markdown，image→img，audio→audio）
     - Raw Response
     - Timing 条：started / ended / duration / status
     - Schema Validation 徽章
3. **用例 Tab**：列表、编辑参数、断言编辑器、单跑、保存为用例（从当前表单）。
4. **历史 Tab**：表格（时间、耗时、状态、来源），点开 diff/详情。
5. **自动化** `/connections/:id/runs` 或全局 `/automation`：选连接/标签批量跑、进度、通过率。
6. **设置** `/settings`：DB 提示、默认超时、主题。

UI 组件库建议：**Ant Design**（与 `@rjsf/antd` 一致）或 shadcn；计划默认 **Ant Design + RJSF antd theme**，交付更快。

## MCP Client 层（server）

`apps/server/src/mcp/connection-manager.ts`

- `connect(id)`：
  1. 读配置
  2. `transport === auto`：先 Streamable HTTP，失败再 SSE
  3. `Client.connect(transport)`，`initialize` 结果缓存
  4. 可选立即 `listTools` 分页
- `listTools(id)`：分页直到无 `nextCursor`
- `callTool(id, name, args, { signal, timeoutMs })`：
  - 记录 `startedAt = Date.now()`
  - try/catch 区分 timeout / protocol / tool result
  - `endedAt`、`durationMs`
  - 若有 `outputSchema`，用 Ajv2020 校验 `structuredContent`
- 连接存活：内存 Map；进程重启后懒连接
- 并发：同一 connection 串行队列可选（配置 `serializeCalls`），避免部分服务器不支持并行

## JSON Schema / RJSF

- 前端 validator：

```ts
import { customizeValidator } from '@rjsf/validator-ajv8';
import Ajv2020 from 'ajv/dist/2020';
const validator = customizeValidator({ AjvClass: Ajv2020 });
```

- 表单：`schema={tool.inputSchema}`，`formData` 双向绑定；提供 **Form / JSON** 双编辑，JSON 变更后回灌。
- 空参数 schema：`{ type: 'object', additionalProperties: false }` 正常渲染空表单。
- 服务端对 invoke 入参可选再校验 inputSchema（防 API 直调）。

## 自动化测试引擎

`CaseRunner`：

1. 加载 case → 确保 connection live → invoke
2. 计算 assertions：
   - `expectIsError` vs `result.isError`
   - `structuredSchemaValid`：对照 tool.outputSchema
   - `structuredEquals`：深度部分匹配（lodash isMatch 语义）
   - text contains / not contains（拼接 text content）
   - `maxDurationMs`
   - 简单 `jsonPathEquals`（用 `jsonpath-plus` 或自写点路径）
3. 写 `invocation_runs` + 更新 suite 计数
4. Suite：顺序执行（默认）；`parallel` 限制并发 1–N

## 项目结构

```
mcp-tool-debug/
  package.json                 # pnpm workspace
  pnpm-workspace.yaml
  apps/
    web/                       # Vite React TS
      src/
        pages/
        components/
          SchemaForm.tsx
          ResultViewer.tsx
          TimingBar.tsx
          CaseEditor.tsx
        api/
        styles/
    server/
      src/
        index.ts
        routes/
        mcp/
        db/
          schema.sqlite.ts
          schema.pg.ts
          client.ts
          repos/
        services/
          case-runner.ts
          assert.ts
          schema-validate.ts
      data/                    # sqlite 文件目录
  packages/
    shared/
      src/
        types.ts
        assert-schema.ts
```

## 环境变量

```
PORT=8787
DATABASE_URL=file:./data/mcp-debug.db   # 或 postgres://...
DB_DIALECT=sqlite|postgres              # 可从 URL 推断
SECRET_KEY=optional-for-header-encrypt
CORS_ORIGIN=http://localhost:5173
DEFAULT_TIMEOUT_MS=60000
```

## Implementation Phases

### Phase 0：脚手架（可运行空壳）

- pnpm monorepo、TS strict、eslint/prettier 可选精简
- server Hono 健康检查；web Vite 代理 `/api`
- Drizzle SQLite schema + migrate + 启动自动 migrate
- PG schema 镜像与 `createDb()` 分支

### Phase 1：连接 + Tool 同步 + 手动调用

- connections CRUD + connect/disconnect/sync
- tools 列表 UI + RJSF 调用 + 结果双形态 + Timing
- `invocation_runs` 自动落库（每次 invoke）

### Phase 2：测试用例 + 历史

- cases CRUD、从当前调用「另存为用例」
- 历史列表/详情、复制参数再跑
- 导出/导入连接与用例 JSON

### Phase 3：自动化与断言

- assert 编辑器 + CaseRunner + suite runs
- 批量跑 UI 与通过率；失败详情
- outputSchema 校验徽章

### Phase 4：打磨

- 搜索过滤、tags、超时取消、错误友好文案
- 结果大字段截断/懒加载策略
- README 使用说明（仅此文档用户未强制时也可在交付时加简短 README）
- 基础 smoke 测试（server 单测 assert 引擎）

## Proposed Changes（按模块）

| 模块 | 做什么 | 为什么 |
|------|--------|--------|
| `apps/server` | MCP 客户端池、REST、DB、Runner | 核心业务在服务端，便于密钥与长连接 |
| `apps/web` | 调试 UI、RJSF、Markdown、CodeMirror | 用户交互与可视化 |
| `packages/shared` | 共享 DTO、断言类型 | 前后端一致 |
| `apps/server/src/db` | SQLite+PG schema/repo | 本地默认、可迁 PG |

## Assumptions & Decisions

1. **传输**：仅 Streamable HTTP + SSE（含 auto 回退）；无 stdio。
2. **能力**：仅 Tools；Resources/Prompts 不做 UI。
3. **部署**：本地单机调试台，无鉴权。
4. **默认库**：SQLite 文件；`DATABASE_URL` 为 `postgres://` 时走 PG。
5. **UI 库**：Ant Design + `@rjsf/antd`。
6. **每次手动调用默认写入 history**（可在设置关闭）。
7. **包管理**：pnpm；Node ≥ 20。
8. **语言**：代码与注释英文标识符；用户可见 UI 文案中文。

## Verification

1. 用公开/本地 Streamable HTTP MCP（或 SSE 兼容服务）添加连接 → connect → sync tools 成功。
2. 选带 `inputSchema` 的 tool，RJSF 填参 invoke：看到 duration、content markdown、structured JSON。
3. 带 `outputSchema` 的 tool：校验通过/失败可见。
4. 保存用例 → 单跑 → suite 批量跑 → suite 汇总与 runs 明细正确。
5. 切换 `DATABASE_URL` 到 PostgreSQL（若可用）迁移与 CRUD 仍可用；默认 SQLite 路径可重启数据保留。
6. 断网/错误 URL：连接错误写入 `last_error`，invoke 记 `protocol_error`。
7. 超时：`status=timeout`，有 started/ended。

## Risks & Mitigations

| 风险 | 缓解 |
|------|------|
| RJSF 对 2020-12 高级关键字 UI 不完整 | Ajv2020 校验 + Form/JSON 双模式兜底 |
| 部分服务器仅 SSE | auto 回退 |
| 大响应撑爆 DB | 可配置 max store size / 截断 raw |
| 连接进程内状态丢失 | 懒重连；UI 显示 live 状态 |
| Drizzle 双方言重复 | repo 接口 + 两套 schema，共用 SQL 语义字段 |

## Out of scope follow-ups

- stdio transport 与本地进程管理
- OAuth MCP 授权
- Resources/Prompts 调试
- 团队协作与 RBAC

## 执行顺序（落地时严格按此）

1. 初始化 monorepo 与依赖
2. DB schema + migrate（SQLite）
3. Connection + MCP client + sync/invoke API
4. Web 连接/工具/调用/结果
5. Cases + Runs 历史
6. Assert + Suite 自动化
7. PG 适配验证与 README

---

**参考**

- [MCP Tools 规范](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
- [MCP TypeScript Client](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/client.md)
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema)
- [react-jsonschema-form](https://github.com/rjsf-team/react-jsonschema-form)
