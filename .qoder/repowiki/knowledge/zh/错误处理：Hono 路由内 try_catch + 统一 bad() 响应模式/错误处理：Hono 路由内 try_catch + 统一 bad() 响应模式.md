---
kind: error_handling
name: 错误处理：Hono 路由内 try/catch + 统一 bad() 响应模式
category: error_handling
scope:
    - '**'
source_files:
    - apps/server/src/routes/api.ts
    - apps/server/src/mcp/connection-manager.ts
    - apps/server/src/index.ts
    - apps/web/src/api/client.ts
    - apps/server/src/services/assert.ts
---

本仓库未定义统一的自定义 Error 类型或全局错误中间件，而是采用“在路由层就近捕获、用 `bad()` 返回 JSON 错误体”的轻量约定。核心特征如下：

1. **HTTP 层错误表示**
   - `apps/server/src/routes/api.ts` 中定义局部函数 `bad(c, message, status = 400)`，统一返回 `{ error: message }` JSON 体；所有业务异常均通过 `try/catch` 捕获后调用 `bad(...)` 返回，状态码按场景选择 400/404/500/502。
   - 入口 `apps/server/src/index.ts` 仅对顶层 `main().catch(...)` 做兜底，打印堆栈并 `process.exit(1)`，不引入全局中间件。

2. **领域层抛错方式**
   - 服务与连接管理直接 `throw new Error("..." )`（如 `connection-manager.ts` 中的 “连接不存在”、“MCP session recovery failed”），并在路由层被 `err instanceof Error ? err.message : String(err)` 提取为字符串消息。
   - 超时错误通过附加 `code: "TIMEOUT"` 字段区分，由 `callTool` 内部转换为 `status: "timeout"` 的 `CallToolResult`，而非向上抛出。

3. **外部 SDK 错误处理**
   - `@modelcontextprotocol/sdk` 的 `StreamableHTTPError` 被用于识别 HTTP 404 会话过期，触发 `withSessionRecovery` 自动重连；其他异常则记录到 `lastError` 字段并通过 `markConnectionStatus` 持久化。
   - 网络/传输层关闭操作普遍使用 `.catch(() => undefined)` 静默忽略，避免清理阶段影响主流程。

4. **前端侧**
   - `apps/web/src/api/client.ts` 对 `res.json()` 使用 `.catch(() => ({}))` 降级解析失败，未定义统一错误类。

5. **断言与校验错误**
   - `services/assert.ts` 与 `services/schema-validate.ts` 将断言失败表达为结构化结果对象（`AssertResult.checks[]`、`SchemaValidationResult`），而非抛错，由上层组装成测试报告。

开发者应遵循的规则：
- 在 Hono 路由 handler 中使用 `try/catch` 包裹异步调用，并用 `bad(c, message, status)` 返回 JSON 错误体；不要向上传播未捕获异常。
- 领域层抛错时优先使用 `new Error("可读消息")`，必要时附加 `code` 字段以便上层区分（如 TIMEOUT）。
- 对外部 SDK 的错误进行显式分类（如 `StreamableHTTPError`），需要恢复的操作放在专用方法（如 `withSessionRecovery`）中处理。
- 资源清理（close/terminate）一律 `.catch(() => undefined)` 静默失败，不影响主路径。
- 断言/校验失败以结构化数据返回，不在业务流中抛错。