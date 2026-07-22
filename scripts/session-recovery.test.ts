import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDataDir = mkdtempSync(path.join(tmpdir(), "mcp-tool-debug-"));
process.env.DB_DIALECT = "sqlite";
process.env.DATABASE_URL = path.join(testDataDir, "session-recovery.db");

interface MockStats {
  initializedSessions: number;
  sessionNotFoundResponses: number;
  listToolsCalls: number;
  toolCalls: number;
  activeToolCalls: number;
  maxConcurrentToolCalls: number;
}

interface MockProcess {
  port: number;
  process: ChildProcessWithoutNullStreams;
  stats(): Promise<MockStats>;
  stop(): Promise<void>;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate mock MCP port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function startMock(mode: string): Promise<MockProcess> {
  const port = await freePort();
  const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
  const mockScript = path.join(rootDir, "scripts", "mock-mcp-server.ts");
  const child = spawn(process.execPath, [tsxCli, mockScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      MOCK_MCP_PORT: String(port),
      MOCK_MCP_SESSION_MODE: mode,
      MOCK_MCP_SLOW_DELAY_MS: "150",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out starting mock MCP (${mode})`)),
      10_000,
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("[mock-mcp] listening")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Mock MCP exited with ${code}: ${stderr}`));
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return {
    port,
    process: child,
    async stats() {
      const response = await fetch(`http://127.0.0.1:${port}/stats`);
      assert.equal(response.status, 200);
      return (await response.json()) as MockStats;
    },
    async stop() {
      if (child.exitCode !== null) return;
      child.kill();
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    },
  };
}

test("Streamable HTTP session recovery and public connection safety", async (t) => {
  const { migrate } = await import("../apps/server/src/db/client.js");
  const repo = await import("../apps/server/src/db/repos.js");
  const { connectionManager } = await import(
    "../apps/server/src/mcp/connection-manager.js"
  );
  const {
    cancelSuiteRun,
    getSuiteProgress,
    runSuite,
    startSuiteRun,
    SuiteConflictError,
  } = await import("../apps/server/src/services/case-runner.js");
  const { default: api } = await import("../apps/server/src/routes/api.js");
  await migrate();

  async function withMock(
    mode: string,
    run: (mock: MockProcess) => Promise<void>,
  ) {
    const mock = await startMock(mode);
    try {
      await run(mock);
    } finally {
      await mock.stop();
    }
  }

  async function createConnection(mock: MockProcess, timeoutMs = 2_000) {
    return repo.createConnection({
      name: `mock-${mock.port}`,
      url: `http://127.0.0.1:${mock.port}/mcp`,
      transport: "streamable_http",
      timeoutMs,
      headers: { Authorization: "Bearer integration-test-secret" },
    });
  }

  await t.test("syncTools starts a new session and restarts pagination", async () => {
    await withMock("expire-once", async (mock) => {
      const conn = await createConnection(mock);
      try {
        await connectionManager.connect(conn.id);
        const tools = await connectionManager.syncTools(conn.id);
        assert.equal(tools.length, 5);
        assert.equal(connectionManager.isLive(conn.id), true);
        assert.deepEqual(await mock.stats(), {
          initializedSessions: 2,
          sessionNotFoundResponses: 1,
          listToolsCalls: 1,
          toolCalls: 0,
          activeToolCalls: 0,
          maxConcurrentToolCalls: 0,
        });
      } finally {
        await connectionManager.disconnect(conn.id);
      }
    });
  });

  await t.test("callTool retries once before persistence", async () => {
    await withMock("expire-once", async (mock) => {
      const conn = await createConnection(mock);
      try {
        await connectionManager.connect(conn.id);
        const result = await connectionManager.callTool(conn.id, "ping", {});
        assert.equal(result.status, "success");
        assert.equal(result.isError, false);
        const stats = await mock.stats();
        assert.equal(stats.initializedSessions, 2);
        assert.equal(stats.sessionNotFoundResponses, 1);
        assert.equal(stats.toolCalls, 1);
      } finally {
        await connectionManager.disconnect(conn.id);
      }
    });
  });

  await t.test("suite recovery creates one final invocation record", async () => {
    await withMock("expire-once", async (mock) => {
      const conn = await createConnection(mock);
      try {
        const testCase = await repo.createCase(conn.id, "ping", {
          name: "recovering suite case",
          arguments: {},
          assert: { expectIsError: false },
        });
        await connectionManager.connect(conn.id);
        const suite = await runSuite(conn.id, { caseIds: [testCase.id] });
        assert.equal(suite.status, "passed");
        assert.equal(suite.total, 1);
        const runs = await repo.listRuns({ suiteRunId: suite.id });
        assert.equal(runs.length, 1);
        assert.equal(runs[0].status, "success");
        assert.equal((await mock.stats()).toolCalls, 1);
      } finally {
        await connectionManager.disconnect(conn.id);
      }
    });
  });

  await t.test("a second 404 evicts the replacement session", async () => {
    await withMock("reject-requests", async (mock) => {
      const conn = await createConnection(mock);
      await connectionManager.connect(conn.id);
      const result = await connectionManager.callTool(conn.id, "ping", {});
      assert.equal(result.status, "protocol_error");
      assert.equal(connectionManager.isLive(conn.id), false);
      const stored = await repo.getConnection(conn.id);
      assert.match(stored?.lastError ?? "", /404/);
      const stats = await mock.stats();
      assert.equal(stats.initializedSessions, 2);
      assert.equal(stats.sessionNotFoundResponses, 2);
      assert.equal(stats.toolCalls, 0);
    });
  });

  async function waitForSuite(suiteId: string) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const progress = await getSuiteProgress(suiteId);
      assert.ok(progress);
      if (["passed", "failed", "cancelled"].includes(progress.suite.status)) {
        return progress;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Timed out waiting for suite ${suiteId}`);
  }

  await t.test("async suite returns immediately and uses independent sessions", async () => {
    await withMock("normal", async (mock) => {
      const conn = await createConnection(mock);
      const cases = await Promise.all(Array.from({ length: 4 }, (_, index) =>
        repo.createCase(conn.id, "slow", {
          name: `parallel-${index}`,
          arguments: {},
          assert: { expectIsError: false },
        })));
      const startedAt = Date.now();
      const suite = await startSuiteRun(conn.id, {
        caseIds: cases.map((item) => item.id),
        parallel: 2,
      });
      assert.equal(suite.status, "running");
      assert.ok(Date.now() - startedAt < 100);
      await assert.rejects(
        () => startSuiteRun(conn.id, { caseIds: [cases[0].id], parallel: 1 }),
        SuiteConflictError,
      );
      const progress = await waitForSuite(suite.id);
      assert.equal(progress.suite.status, "passed");
      assert.equal(progress.suite.passed, 4);
      assert.equal(progress.runs.length, 4);
      const stats = await mock.stats();
      assert.equal(stats.initializedSessions, 2);
      assert.equal(stats.maxConcurrentToolCalls, 2);
      assert.equal(stats.toolCalls, 4);
      const history = await repo.listRunSummaries({ testCaseId: cases[0].id });
      assert.equal(history.length, 1);
      const overviews = await repo.listCaseOverviews(conn.id);
      assert.equal(overviews.filter((item) => item.lastRun?.passed).length, 4);
    });
  });

  await t.test("async worker recovers an expired session before persisting", async () => {
    await withMock("expire-once", async (mock) => {
      const conn = await createConnection(mock);
      const testCase = await repo.createCase(conn.id, "ping", {
        name: "worker recovery",
        arguments: {},
        assert: { expectIsError: false },
      });
      const suite = await startSuiteRun(conn.id, {
        caseIds: [testCase.id],
        parallel: 1,
      });
      const progress = await waitForSuite(suite.id);
      assert.equal(progress.suite.status, "passed");
      assert.equal(progress.runs.length, 1);
      const stats = await mock.stats();
      assert.equal(stats.initializedSessions, 2);
      assert.equal(stats.sessionNotFoundResponses, 1);
      assert.equal(stats.toolCalls, 1);
    });
  });

  await t.test("cancelling stops scheduling and marks remaining cases skipped", async () => {
    await withMock("normal", async (mock) => {
      const conn = await createConnection(mock);
      const cases = await Promise.all(Array.from({ length: 6 }, (_, index) =>
        repo.createCase(conn.id, "slow", {
          name: `cancel-${index}`,
          arguments: {},
          assert: { expectIsError: false },
        })));
      const suite = await startSuiteRun(conn.id, {
        caseIds: cases.map((item) => item.id),
        parallel: 2,
      });
      const deadline = Date.now() + 5_000;
      while ((await mock.stats()).toolCalls < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      const cancellingSuite = await cancelSuiteRun(suite.id);
      assert.equal(cancellingSuite?.status, "cancelling");
      const progress = await waitForSuite(suite.id);
      assert.equal(progress.suite.status, "cancelled");
      assert.equal(progress.suite.passed, 2);
      assert.equal(progress.suite.failed, 0);
      assert.equal(progress.suite.skipped, 4);
      assert.equal((await mock.stats()).toolCalls, 2);
    });
  });

  await t.test("interrupted suite runs are reconciled as cancelled", async () => {
    const suite = await repo.createSuiteRun({ name: "interrupted", total: 3 });
    await repo.updateSuiteRun(suite.id, { passed: 1 });
    assert.equal(await repo.reconcileInterruptedSuiteRuns(), 1);
    const reconciled = await repo.getSuiteRun(suite.id);
    assert.equal(reconciled?.status, "cancelled");
    assert.equal(reconciled?.passed, 1);
    assert.equal(reconciled?.skipped, 2);
  });

  for (const mode of ["http-401", "http-500"]) {
    await t.test(`${mode} is not retried`, async () => {
      await withMock(mode, async (mock) => {
        const conn = await createConnection(mock);
        try {
          await connectionManager.connect(conn.id);
          const result = await connectionManager.callTool(conn.id, "ping", {});
          assert.equal(result.status, "protocol_error");
          assert.equal(connectionManager.isLive(conn.id), true);
          assert.equal((await mock.stats()).initializedSessions, 1);
        } finally {
          await connectionManager.disconnect(conn.id);
        }
      });
    });
  }

  await t.test("tool errors and timeouts are not retried", async () => {
    await withMock("normal", async (mock) => {
      const conn = await createConnection(mock, 40);
      try {
        await connectionManager.connect(conn.id);
        const toolError = await connectionManager.callTool(conn.id, "fail", {});
        assert.equal(toolError.status, "tool_error");
        const timeout = await connectionManager.callTool(conn.id, "slow", {});
        assert.equal(timeout.status, "timeout");
        assert.equal((await mock.stats()).initializedSessions, 1);
      } finally {
        await new Promise((resolve) => setTimeout(resolve, 175));
        await connectionManager.disconnect(conn.id);
      }
    });
  });

  await t.test("connection APIs never expose header values", async () => {
    const stored = await repo.createConnection({
      name: "secret-response-test",
      url: "http://127.0.0.1:1/mcp",
      headers: {
        Authorization: "Bearer must-not-leak",
        "X-API-Key": "also-secret",
      },
    });

    const getResponse = await api.request(`/connections/${stored.id}`);
    assert.equal(getResponse.status, 200);
    const publicConnection = (await getResponse.json()) as Record<string, unknown>;
    assert.equal("headers" in publicConnection, false);
    assert.deepEqual(publicConnection.headerNames, ["Authorization", "X-API-Key"]);
    assert.equal(JSON.stringify(publicConnection).includes("must-not-leak"), false);

    const listResponse = await api.request("/connections");
    assert.equal(listResponse.status, 200);
    const publicList = (await listResponse.json()) as Array<Record<string, unknown>>;
    const listedConnection = publicList.find((item) => item.id === stored.id);
    assert.ok(listedConnection);
    assert.equal("headers" in listedConnection, false);
    assert.equal(JSON.stringify(listedConnection).includes("also-secret"), false);

    const preserveResponse = await api.request(`/connections/${stored.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "preserve headers" }),
    });
    assert.equal(preserveResponse.status, 200);
    assert.equal(
      (await repo.getConnection(stored.id))?.headers.Authorization,
      "Bearer must-not-leak",
    );
    assert.equal(JSON.stringify(await preserveResponse.json()).includes("must-not-leak"), false);

    const patchHeadersResponse = await api.request(`/connections/${stored.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        headerPatch: {
          authorization: "Bearer replaced-secret",
          "X-API-Key": null,
          "X-Tenant": "tenant-secret",
        },
      }),
    });
    assert.equal(patchHeadersResponse.status, 200);
    assert.deepEqual((await repo.getConnection(stored.id))?.headers, {
      authorization: "Bearer replaced-secret",
      "X-Tenant": "tenant-secret",
    });
    const patchedPublicConnection = await patchHeadersResponse.json() as Record<string, unknown>;
    assert.deepEqual(patchedPublicConnection.headerNames, ["authorization", "X-Tenant"]);
    assert.equal(JSON.stringify(patchedPublicConnection).includes("replaced-secret"), false);
    assert.equal(JSON.stringify(patchedPublicConnection).includes("tenant-secret"), false);

    const invalidPatchResponse = await api.request(`/connections/${stored.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headerPatch: { Authorization: 42 } }),
    });
    assert.equal(invalidPatchResponse.status, 400);
    assert.equal(
      (await repo.getConnection(stored.id))?.headers.authorization,
      "Bearer replaced-secret",
    );

    const clearResponse = await api.request(`/connections/${stored.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ headers: {} }),
    });
    assert.equal(clearResponse.status, 200);
    assert.deepEqual((await repo.getConnection(stored.id))?.headers, {});
  });
});
