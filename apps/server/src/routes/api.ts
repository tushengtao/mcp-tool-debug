import { Hono } from "hono";
import { z } from "zod";
import type {
  CreateConnectionInput,
  CreateTestCaseInput,
  ExportBundle,
  McpConnection,
  StartSuiteRunRequest,
  SuiteRunRequest,
  UpdateConnectionInput,
  UpdateTestCaseInput,
} from "@mcp-debug/shared";
import { connectionManager } from "../mcp/connection-manager.js";
import * as repo from "../db/repos.js";
import type { StoredMcpConnection } from "../db/repos.js";
import {
  cancelSuiteRun,
  getSuiteProgress,
  invokeAndPersist,
  runCase,
  runSuite,
  startSuiteRun,
  SuiteConflictError,
} from "../services/case-runner.js";
import { dialect } from "../db/client.js";

const app = new Hono();

function bad(c: any, message: string, status = 400) {
  return c.json({ error: message }, status);
}

function isHeaderPatch(value: unknown): value is Record<string, string | null> {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.entries(value as Record<string, unknown>).every(
      ([name, headerValue]) => name.length > 0
        && name === name.trim()
        && (typeof headerValue === "string" || headerValue === null),
    );
}

function toPublicConnection(conn: StoredMcpConnection): McpConnection {
  const { headers, ...publicFields } = conn;
  return {
    ...publicFields,
    headerNames: Object.keys(headers).sort((a, b) => a.localeCompare(b)),
  };
}

app.get("/health", (c) =>
  c.json({
    ok: true,
    dialect,
    liveConnections: connectionManager.liveIds().size,
  }),
);

// Connections
app.get("/connections", async (c) => {
  const list = await repo.listConnections(connectionManager.liveIds());
  return c.json(list.map(toPublicConnection));
});

app.post("/connections", async (c) => {
  const body = (await c.req.json()) as CreateConnectionInput;
  if (!body?.name || !body?.url) return bad(c, "name 与 url 必填");
  const created = await repo.createConnection(body);
  return c.json(toPublicConnection(created), 201);
});

app.get("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const conn = await repo.getConnection(id, connectionManager.isLive(id));
  if (!conn) return bad(c, "连接不存在", 404);
  return c.json(toPublicConnection(conn));
});

app.patch("/connections/:id", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as UpdateConnectionInput;
  if (body.headers !== undefined && body.headerPatch !== undefined) {
    return bad(c, "headers 与 headerPatch 不能同时提交");
  }
  if (body.headerPatch !== undefined && !isHeaderPatch(body.headerPatch)) {
    return bad(c, "headerPatch 必须是值为字符串或 null 的对象");
  }
  const updated = await repo.updateConnection(id, body);
  if (!updated) return bad(c, "连接不存在", 404);
  return c.json(
    toPublicConnection({ ...updated, live: connectionManager.isLive(id) }),
  );
});

app.delete("/connections/:id", async (c) => {
  const id = c.req.param("id");
  await connectionManager.disconnect(id);
  await repo.deleteConnection(id);
  return c.json({ ok: true });
});

app.post("/connections/:id/connect", async (c) => {
  const id = c.req.param("id");
  try {
    const conn = await connectionManager.connect(id);
    return c.json(toPublicConnection(conn));
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), 502);
  }
});

app.post("/connections/:id/disconnect", async (c) => {
  const id = c.req.param("id");
  await connectionManager.disconnect(id);
  const conn = await repo.getConnection(id, false);
  return c.json(conn ? toPublicConnection(conn) : null);
});

app.post("/connections/:id/sync-tools", async (c) => {
  const id = c.req.param("id");
  try {
    const tools = await connectionManager.syncTools(id);
    return c.json({ count: tools.length, tools });
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), 502);
  }
});

app.get("/connections/:id/tools", async (c) => {
  const id = c.req.param("id");
  const q = c.req.query("q") ?? undefined;
  const tools = await repo.listTools(id, q);
  return c.json(tools);
});

app.get("/connections/:id/tools/:toolName", async (c) => {
  const tool = await repo.getTool(c.req.param("id"), c.req.param("toolName"));
  if (!tool) return bad(c, "工具不存在", 404);
  return c.json(tool);
});

app.post("/connections/:id/tools/:toolName/invoke", async (c) => {
  const connectionId = c.req.param("id");
  const toolName = c.req.param("toolName");
  const body = (await c.req.json().catch(() => ({}))) as {
    arguments?: Record<string, unknown>;
    save?: boolean;
    testCaseId?: string;
  };
  try {
    const res = await invokeAndPersist({
      connectionId,
      toolName,
      arguments: body.arguments ?? {},
      source: body.testCaseId ? "case" : "manual",
      testCaseId: body.testCaseId,
      save: body.save !== false,
    });
    return c.json(res);
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), 500);
  }
});

// Cases
app.get("/connections/:id/tools/:toolName/cases", async (c) => {
  const cases = await repo.listCases(c.req.param("id"), c.req.param("toolName"));
  return c.json(cases);
});

app.post("/connections/:id/tools/:toolName/cases", async (c) => {
  const body = (await c.req.json()) as CreateTestCaseInput;
  if (!body?.name) return bad(c, "name 必填");
  const created = await repo.createCase(
    c.req.param("id"),
    c.req.param("toolName"),
    body,
  );
  return c.json(created, 201);
});

app.get("/connections/:id/cases", async (c) => {
  const cases = await repo.listCases(c.req.param("id"));
  return c.json(cases);
});

app.get("/connections/:id/cases/overview", async (c) => {
  return c.json(await repo.listCaseOverviews(c.req.param("id")));
});

app.patch("/cases/:id", async (c) => {
  const body = (await c.req.json()) as UpdateTestCaseInput;
  const updated = await repo.updateCase(c.req.param("id"), body);
  if (!updated) return bad(c, "用例不存在", 404);
  return c.json(updated);
});

app.delete("/cases/:id", async (c) => {
  await repo.deleteCase(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/cases/:id/run", async (c) => {
  try {
    const res = await runCase(c.req.param("id"));
    return c.json(res);
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), 500);
  }
});

app.post("/connections/:id/suites/run", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as SuiteRunRequest;
  try {
    const suite = await runSuite(c.req.param("id"), body);
    return c.json(suite);
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), err instanceof SuiteConflictError ? 409 : 500);
  }
});

const startSuiteSchema = z.object({
  caseIds: z.array(z.string().min(1)).min(1),
  parallel: z.number().int().min(1).max(8).optional(),
  name: z.string().trim().min(1).max(160).optional(),
});

app.post("/connections/:id/suite-runs", async (c) => {
  const parsed = startSuiteSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return bad(c, parsed.error.issues[0]?.message ?? "无效运行参数");
  try {
    const suite = await startSuiteRun(
      c.req.param("id"),
      parsed.data as StartSuiteRunRequest,
    );
    return c.json(suite, 202);
  } catch (err) {
    return bad(c, err instanceof Error ? err.message : String(err), err instanceof SuiteConflictError ? 409 : 400);
  }
});

app.get("/suite-runs", async (c) => {
  const connectionId = c.req.query("connectionId") ?? undefined;
  return c.json(await repo.listSuiteRuns(connectionId));
});

app.get("/suite-runs/:id", async (c) => {
  const suite = await repo.getSuiteRun(c.req.param("id"));
  if (!suite) return bad(c, "套件不存在", 404);
  const runs = await repo.listRuns({ suiteRunId: suite.id, limit: 500 });
  return c.json({ suite, runs });
});

app.get("/suite-runs/:id/progress", async (c) => {
  const progress = await getSuiteProgress(c.req.param("id"));
  if (!progress) return bad(c, "运行批次不存在", 404);
  return c.json(progress);
});

app.post("/suite-runs/:id/cancel", async (c) => {
  const suite = await cancelSuiteRun(c.req.param("id"));
  if (!suite) return bad(c, "运行批次不存在", 404);
  return c.json(suite);
});

app.get("/runs", async (c) => {
  const filter = {
    connectionId: c.req.query("connectionId") ?? undefined,
    toolName: c.req.query("toolName") ?? undefined,
    testCaseId: c.req.query("testCaseId") ?? undefined,
    suiteRunId: c.req.query("suiteRunId") ?? undefined,
    status: c.req.query("status") ?? undefined,
    limit: Number(c.req.query("limit") ?? 100),
  };
  return c.json(c.req.query("summary") === "true"
    ? await repo.listRunSummaries(filter)
    : await repo.listRuns(filter));
});

app.get("/runs/:id", async (c) => {
  const run = await repo.getRun(c.req.param("id"));
  if (!run) return bad(c, "记录不存在", 404);
  return c.json(run);
});

app.delete("/runs/:id", async (c) => {
  await repo.deleteRun(c.req.param("id"));
  return c.json({ ok: true });
});

app.get("/export", async (c) => {
  const connections = await repo.listConnections(new Set());
  const bundle: ExportBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    connections: [],
  };
  for (const conn of connections) {
    const cases = await repo.listCases(conn.id);
    const { live, lastConnectedAt, lastError, serverInfo, ...rest } = conn;
    bundle.connections.push({ ...rest, cases });
  }
  return c.json(bundle);
});

app.post("/import", async (c) => {
  const body = (await c.req.json()) as ExportBundle;
  if (!body?.connections) return bad(c, "无效导入数据");
  let connections = 0;
  let cases = 0;
  for (const item of body.connections) {
    const created = await repo.createConnection({
      name: item.name,
      description: item.description ?? undefined,
      transport: item.transport,
      url: item.url,
      headers: item.headers,
      timeoutMs: item.timeoutMs,
      enabled: item.enabled,
    });
    connections += 1;
    for (const tc of item.cases ?? []) {
      await repo.createCase(created.id, tc.toolName, {
        name: tc.name,
        description: tc.description ?? undefined,
        arguments: tc.arguments,
        assert: tc.assert,
        tags: tc.tags,
        enabled: tc.enabled,
      });
      cases += 1;
    }
  }
  return c.json({ connections, cases });
});

export default app;
