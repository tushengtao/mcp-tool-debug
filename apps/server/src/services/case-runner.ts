import type {
  AssertConfig,
  InvokeResponse,
  RunSource,
  SuiteRunRequest,
} from "@mcp-debug/shared";
import { connectionManager } from "../mcp/connection-manager.js";
import * as repo from "../db/repos.js";
import { evaluateAssert } from "./assert.js";

export async function invokeAndPersist(input: {
  connectionId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  source: RunSource;
  testCaseId?: string | null;
  suiteRunId?: string | null;
  assert?: AssertConfig | null;
  save?: boolean;
}): Promise<InvokeResponse> {
  const result = await connectionManager.callTool(
    input.connectionId,
    input.toolName,
    input.arguments ?? {},
  );

  let assertResult = null;
  if (input.assert) {
    assertResult = evaluateAssert({
      assert: input.assert,
      isError: result.isError,
      content: result.content,
      structuredContent: result.structuredContent,
      durationMs: result.durationMs,
      schemaValidation: result.schemaValidation,
    });
  }

  const shouldSave = input.save !== false;
  let runId = "";
  if (shouldSave) {
    const run = await repo.createRun({
      connectionId: input.connectionId,
      toolName: input.toolName,
      testCaseId: input.testCaseId ?? null,
      suiteRunId: input.suiteRunId ?? null,
      source: input.source,
      requestArguments: input.arguments ?? {},
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      durationMs: result.durationMs,
      status: result.status,
      isError: result.isError,
      resultContent: result.content,
      resultStructured: result.structuredContent,
      protocolError: result.protocolError,
      assertResult,
      schemaValidation: result.schemaValidation,
      rawResponse: result.rawResponse,
    });
    runId = run.id;
  }

  return {
    runId,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    status: result.status,
    isError: result.isError,
    content: result.content,
    structuredContent: result.structuredContent,
    schemaValidation: result.schemaValidation,
    assertResult,
    protocolError: result.protocolError,
  };
}

export async function runCase(caseId: string, suiteRunId?: string) {
  const testCase = await repo.getCase(caseId);
  if (!testCase) throw new Error("用例不存在");
  return invokeAndPersist({
    connectionId: testCase.connectionId,
    toolName: testCase.toolName,
    arguments: testCase.arguments,
    source: suiteRunId ? "suite" : "case",
    testCaseId: testCase.id,
    suiteRunId,
    assert: testCase.assert,
    save: true,
  });
}

async function mapPool<T, R>(
  items: T[],
  parallel: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, parallel) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function runSuite(connectionId: string, req: SuiteRunRequest) {
  const cases = await repo.listCasesByFilter({
    connectionId,
    toolNames: req.toolNames,
    caseIds: req.caseIds,
    tags: req.tags,
  });
  const suite = await repo.createSuiteRun({
    connectionId,
    name: req.name ?? `suite-${new Date().toISOString()}`,
    filter: {
      toolNames: req.toolNames,
      caseIds: req.caseIds,
      tags: req.tags,
      parallel: req.parallel ?? 1,
    },
    total: cases.length,
  });

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  await mapPool(cases, req.parallel ?? 1, async (c) => {
    try {
      const res = await runCase(c.id, suite.id);
      const ok =
        res.assertResult != null
          ? res.assertResult.passed
          : res.status === "success" && !res.isError;
      if (ok) passed += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  });

  const endedAt = new Date().toISOString();
  const durationMs = Date.parse(endedAt) - Date.parse(suite.startedAt);
  const updated = await repo.updateSuiteRun(suite.id, {
    endedAt,
    durationMs,
    passed,
    failed,
    skipped,
    total: cases.length,
    status: failed > 0 ? "failed" : "passed",
  });
  return updated;
}
