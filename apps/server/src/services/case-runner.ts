import type {
  AssertConfig,
  InvokeResponse,
  RunSource,
  StartSuiteRunRequest,
  SuiteRunRequest,
  SuiteRunProgress,
  TestCase,
} from "@mcp-debug/shared";
import { connectionManager } from "../mcp/connection-manager.js";
import type { CallToolResult, ExecutionWorker } from "../mcp/connection-manager.js";
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
  executor?: (toolName: string, args: Record<string, unknown>) => Promise<CallToolResult>;
}): Promise<InvokeResponse> {
  const result = input.executor
    ? await input.executor(input.toolName, input.arguments ?? {})
    : await connectionManager.callTool(
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

export class SuiteConflictError extends Error {
  readonly code = "SUITE_ALREADY_RUNNING";
}

interface ActiveSuiteJob {
  suiteId: string;
  connectionId: string;
  cancelRequested: boolean;
}

const activeJobs = new Map<string, ActiveSuiteJob>();
const startingConnections = new Set<string>();

function passedResult(result: InvokeResponse): boolean {
  return result.assertResult != null
    ? result.assertResult.passed
    : result.status === "success" && !result.isError;
}

async function runSnapshotCase(
  testCase: TestCase,
  suiteRunId: string,
  worker: ExecutionWorker,
) {
  return invokeAndPersist({
    connectionId: testCase.connectionId,
    toolName: testCase.toolName,
    arguments: testCase.arguments,
    source: "suite",
    testCaseId: testCase.id,
    suiteRunId,
    assert: testCase.assert,
    save: true,
    executor: worker.callTool,
  });
}

async function executeSuiteJob(
  job: ActiveSuiteJob,
  cases: TestCase[],
  parallel: number,
): Promise<void> {
  let nextIndex = 0;
  let passed = 0;
  let failed = 0;
  let progressWrite = Promise.resolve<unknown>(undefined);
  const persistProgress = () => {
    const snapshot = { passed, failed };
    progressWrite = progressWrite.then(() => repo.updateSuiteRun(job.suiteId, snapshot));
    return progressWrite;
  };

  let workers: ExecutionWorker[] = [];
  try {
    workers = await Promise.all(
      Array.from({ length: Math.min(parallel, cases.length) }, () =>
        connectionManager.createExecutionWorker(job.connectionId)),
    );
    await Promise.all(workers.map(async (worker) => {
      while (!job.cancelRequested && nextIndex < cases.length) {
        const current = nextIndex++;
        const result = await runSnapshotCase(cases[current], job.suiteId, worker);
        if (passedResult(result)) passed += 1;
        else failed += 1;
        await persistProgress();
      }
    }));
    await progressWrite;
    const endedAt = new Date().toISOString();
    const suite = await repo.getSuiteRun(job.suiteId);
    const skipped = Math.max(0, cases.length - passed - failed);
    await repo.updateSuiteRun(job.suiteId, {
      endedAt,
      durationMs: suite ? Date.parse(endedAt) - Date.parse(suite.startedAt) : 0,
      passed,
      failed,
      skipped,
      total: cases.length,
      status: job.cancelRequested ? "cancelled" : failed > 0 ? "failed" : "passed",
    });
  } catch (error) {
    const endedAt = new Date().toISOString();
    const suite = await repo.getSuiteRun(job.suiteId);
    await repo.updateSuiteRun(job.suiteId, {
      endedAt,
      durationMs: suite ? Date.parse(endedAt) - Date.parse(suite.startedAt) : 0,
      passed,
      failed: Math.max(failed, cases.length - passed),
      skipped: 0,
      status: "failed",
    });
    console.error(JSON.stringify({
      event: "suite_job_failed",
      suiteRunId: job.suiteId,
      connectionId: job.connectionId,
      message: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    await Promise.all(workers.map((worker) => worker.close()));
    activeJobs.delete(job.connectionId);
  }
}

export async function startSuiteRun(
  connectionId: string,
  req: StartSuiteRunRequest,
) {
  if (startingConnections.has(connectionId) || activeJobs.has(connectionId)) {
    throw new SuiteConflictError("该连接已有正在运行的批次");
  }
  startingConnections.add(connectionId);
  try {
    if (!Array.isArray(req.caseIds) || req.caseIds.length === 0) {
      throw new Error("至少选择一个测试用例");
    }
    const existing = await repo.getActiveSuiteRun(connectionId);
    if (existing) throw new SuiteConflictError("该连接已有正在运行的批次");
    const parallel = Math.max(1, Math.min(8, Math.trunc(req.parallel ?? 1)));
    const cases = await repo.listCasesByFilter({ connectionId, caseIds: req.caseIds });
    if (!cases.length) throw new Error("没有可运行的已启用用例");
    const suite = await repo.createSuiteRun({
      connectionId,
      name: req.name ?? `batch-${new Date().toISOString()}`,
      filter: { caseIds: cases.map((item) => item.id), parallel },
      total: cases.length,
    });
    const job: ActiveSuiteJob = {
      suiteId: suite.id,
      connectionId,
      cancelRequested: false,
    };
    activeJobs.set(connectionId, job);
    void executeSuiteJob(job, cases, parallel);
    return suite;
  } finally {
    startingConnections.delete(connectionId);
  }
}

export async function getSuiteProgress(suiteId: string): Promise<SuiteRunProgress | null> {
  const suite = await repo.getSuiteRun(suiteId);
  if (!suite) return null;
  const runs = await repo.listRunSummaries({ suiteRunId: suiteId, limit: 500 });
  return { suite, runs };
}

export async function cancelSuiteRun(suiteId: string) {
  const suite = await repo.getSuiteRun(suiteId);
  if (!suite) return null;
  if (suite.status !== "running" && suite.status !== "cancelling") return suite;
  const job = suite.connectionId ? activeJobs.get(suite.connectionId) : undefined;
  if (job?.suiteId === suiteId) {
    job.cancelRequested = true;
    return repo.updateSuiteRun(suiteId, { status: "cancelling" });
  }
  const endedAt = new Date().toISOString();
  return repo.updateSuiteRun(suiteId, {
    status: "cancelled",
    endedAt,
    durationMs: Date.parse(endedAt) - Date.parse(suite.startedAt),
    skipped: Math.max(suite.skipped, suite.total - suite.passed - suite.failed),
  });
}

export async function runSuite(connectionId: string, req: SuiteRunRequest) {
  const active = await repo.getActiveSuiteRun(connectionId);
  if (active) throw new SuiteConflictError("该连接已有正在运行的批次");
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
      const ok = passedResult(res);
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
