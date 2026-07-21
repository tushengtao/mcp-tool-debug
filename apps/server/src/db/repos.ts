import { and, desc, eq } from "drizzle-orm";
import type {
  AssertConfig,
  AssertResult,
  ContentItem,
  CreateConnectionInput,
  CreateTestCaseInput,
  InvocationRun,
  McpConnection,
  McpTool,
  RunSource,
  RunStatus,
  SchemaValidationResult,
  SuiteRun,
  SuiteStatus,
  TestCase,
  TransportType,
  UpdateConnectionInput,
  UpdateTestCaseInput,
} from "@mcp-debug/shared";
import { normalizeAssert } from "@mcp-debug/shared";
import { dialect, getDb, pgSchema, sqliteSchema } from "./client.js";
import { jsonStringify, newId, nowIso, safeJsonParse } from "../util/id.js";

type Tables = typeof sqliteSchema;

export type StoredMcpConnection = Omit<McpConnection, "headerNames"> & {
  headers: Record<string, string>;
};

function tables(): Tables {
  return (dialect === "postgres" ? pgSchema : sqliteSchema) as Tables;
}

function mapConnection(
  row: {
    id: string;
    name: string;
    description: string | null;
    transport: string;
    url: string;
    headersJson: string;
    timeoutMs: number;
    enabled: boolean;
    lastConnectedAt: string | null;
    lastError: string | null;
    serverInfoJson: string | null;
    createdAt: string;
    updatedAt: string;
  },
  live = false,
): StoredMcpConnection {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    transport: row.transport as TransportType,
    url: row.url,
    headers: safeJsonParse<Record<string, string>>(row.headersJson, {}),
    timeoutMs: row.timeoutMs,
    enabled: Boolean(row.enabled),
    lastConnectedAt: row.lastConnectedAt,
    lastError: row.lastError,
    serverInfo: safeJsonParse<Record<string, unknown> | null>(row.serverInfoJson, null),
    live,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTool(row: {
  id: string;
  connectionId: string;
  name: string;
  title: string | null;
  description: string | null;
  inputSchemaJson: string;
  outputSchemaJson: string | null;
  annotationsJson: string | null;
  rawJson: string | null;
  syncedAt: string;
}): McpTool {
  return {
    id: row.id,
    connectionId: row.connectionId,
    name: row.name,
    title: row.title,
    description: row.description,
    inputSchema: safeJsonParse(row.inputSchemaJson, { type: "object" }),
    outputSchema: row.outputSchemaJson
      ? safeJsonParse(row.outputSchemaJson, null)
      : null,
    annotations: row.annotationsJson ? safeJsonParse(row.annotationsJson, null) : null,
    raw: row.rawJson ? safeJsonParse(row.rawJson, null) : null,
    syncedAt: row.syncedAt,
  };
}

function mapCase(row: {
  id: string;
  connectionId: string;
  toolName: string;
  name: string;
  description: string | null;
  argumentsJson: string;
  assertJson: string;
  tagsJson: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}): TestCase {
  return {
    id: row.id,
    connectionId: row.connectionId,
    toolName: row.toolName,
    name: row.name,
    description: row.description,
    arguments: safeJsonParse(row.argumentsJson, {}),
    assert: normalizeAssert(safeJsonParse(row.assertJson, {})),
    tags: safeJsonParse(row.tagsJson, []),
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRun(row: {
  id: string;
  connectionId: string;
  toolName: string;
  testCaseId: string | null;
  suiteRunId: string | null;
  source: string;
  requestArgumentsJson: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: string;
  isError: boolean;
  resultContentJson: string;
  resultStructuredJson: string | null;
  protocolErrorJson: string | null;
  assertResultJson: string | null;
  schemaValidationJson: string | null;
  rawResponseJson: string | null;
  createdAt: string;
}): InvocationRun {
  return {
    id: row.id,
    connectionId: row.connectionId,
    toolName: row.toolName,
    testCaseId: row.testCaseId,
    suiteRunId: row.suiteRunId,
    source: row.source as RunSource,
    requestArguments: safeJsonParse(row.requestArgumentsJson, {}),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    status: row.status as RunStatus,
    isError: Boolean(row.isError),
    resultContent: safeJsonParse(row.resultContentJson, []),
    resultStructured: row.resultStructuredJson
      ? safeJsonParse(row.resultStructuredJson, null)
      : undefined,
    protocolError: row.protocolErrorJson
      ? safeJsonParse(row.protocolErrorJson, null)
      : null,
    assertResult: row.assertResultJson
      ? safeJsonParse(row.assertResultJson, null)
      : null,
    schemaValidation: row.schemaValidationJson
      ? safeJsonParse(row.schemaValidationJson, null)
      : null,
    rawResponse: row.rawResponseJson ? safeJsonParse(row.rawResponseJson, null) : null,
    createdAt: row.createdAt,
  };
}

function mapSuite(row: {
  id: string;
  connectionId: string | null;
  name: string | null;
  filterJson: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  status: string;
  createdAt: string;
}): SuiteRun {
  return {
    id: row.id,
    connectionId: row.connectionId,
    name: row.name,
    filter: row.filterJson ? safeJsonParse(row.filterJson, null) : null,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    total: row.total,
    passed: row.passed,
    failed: row.failed,
    skipped: row.skipped,
    status: row.status as SuiteStatus,
    createdAt: row.createdAt,
  };
}

export async function listConnections(
  liveIds: Set<string>,
): Promise<StoredMcpConnection[]> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db.select().from(t.mcpConnections).orderBy(desc(t.mcpConnections.updatedAt));
  return rows.map((r: any) => mapConnection(r, liveIds.has(r.id)));
}

export async function getConnection(
  id: string,
  live = false,
): Promise<StoredMcpConnection | null> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db
    .select()
    .from(t.mcpConnections)
    .where(eq(t.mcpConnections.id, id))
    .limit(1);
  if (!rows[0]) return null;
  return mapConnection(rows[0], live);
}

export async function createConnection(
  input: CreateConnectionInput,
): Promise<StoredMcpConnection> {
  const t = tables();
  const db = getDb() as any;
  const id = newId();
  const ts = nowIso();
  const row = {
    id,
    name: input.name,
    description: input.description ?? null,
    transport: input.transport ?? "auto",
    url: input.url,
    headersJson: jsonStringify(input.headers ?? {}),
    timeoutMs: input.timeoutMs ?? 60000,
    enabled: input.enabled ?? true,
    lastConnectedAt: null,
    lastError: null,
    serverInfoJson: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(t.mcpConnections).values(row);
  return mapConnection(row, false);
}

export async function updateConnection(
  id: string,
  input: UpdateConnectionInput,
): Promise<StoredMcpConnection | null> {
  const existing = await getConnection(id);
  if (!existing) return null;
  const t = tables();
  const db = getDb() as any;
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.transport !== undefined) patch.transport = input.transport;
  if (input.url !== undefined) patch.url = input.url;
  if (input.headers !== undefined) patch.headersJson = jsonStringify(input.headers);
  if (input.timeoutMs !== undefined) patch.timeoutMs = input.timeoutMs;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  await db.update(t.mcpConnections).set(patch).where(eq(t.mcpConnections.id, id));
  return getConnection(id);
}

export async function deleteConnection(id: string): Promise<boolean> {
  const t = tables();
  const db = getDb() as any;
  await db.delete(t.mcpConnections).where(eq(t.mcpConnections.id, id));
  return true;
}

export async function markConnectionStatus(
  id: string,
  data: {
    lastConnectedAt?: string | null;
    lastError?: string | null;
    serverInfo?: Record<string, unknown> | null;
  },
) {
  const t = tables();
  const db = getDb() as any;
  await db
    .update(t.mcpConnections)
    .set({
      lastConnectedAt: data.lastConnectedAt ?? null,
      lastError: data.lastError ?? null,
      serverInfoJson:
        data.serverInfo === undefined
          ? undefined
          : data.serverInfo
            ? jsonStringify(data.serverInfo)
            : null,
      updatedAt: nowIso(),
    })
    .where(eq(t.mcpConnections.id, id));
}

export async function replaceTools(
  connectionId: string,
  tools: Array<{
    name: string;
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
    raw?: Record<string, unknown>;
  }>,
): Promise<McpTool[]> {
  const t = tables();
  const db = getDb() as any;
  const syncedAt = nowIso();
  await db.delete(t.mcpTools).where(eq(t.mcpTools.connectionId, connectionId));
  if (tools.length) {
    await db.insert(t.mcpTools).values(
      tools.map((tool) => ({
        id: newId(),
        connectionId,
        name: tool.name,
        title: tool.title ?? null,
        description: tool.description ?? null,
        inputSchemaJson: jsonStringify(
          tool.inputSchema ?? { type: "object", additionalProperties: false },
        ),
        outputSchemaJson: tool.outputSchema ? jsonStringify(tool.outputSchema) : null,
        annotationsJson: tool.annotations ? jsonStringify(tool.annotations) : null,
        rawJson: tool.raw ? jsonStringify(tool.raw) : null,
        syncedAt,
      })),
    );
  }
  return listTools(connectionId);
}

export async function listTools(connectionId: string, q?: string): Promise<McpTool[]> {
  const t = tables();
  const db = getDb() as any;
  let rows;
  if (q) {
    const all = await db
      .select()
      .from(t.mcpTools)
      .where(eq(t.mcpTools.connectionId, connectionId))
      .orderBy(t.mcpTools.name);
    const lower = q.toLowerCase();
    rows = all.filter(
      (r: any) =>
        String(r.name ?? "")
          .toLowerCase()
          .includes(lower) ||
        String(r.title ?? "")
          .toLowerCase()
          .includes(lower) ||
        String(r.description ?? "")
          .toLowerCase()
          .includes(lower),
    );
  } else {
    rows = await db
      .select()
      .from(t.mcpTools)
      .where(eq(t.mcpTools.connectionId, connectionId))
      .orderBy(t.mcpTools.name);
  }
  return rows.map(mapTool);
}

export async function getTool(
  connectionId: string,
  toolName: string,
): Promise<McpTool | null> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db
    .select()
    .from(t.mcpTools)
    .where(
      and(eq(t.mcpTools.connectionId, connectionId), eq(t.mcpTools.name, toolName)),
    )
    .limit(1);
  return rows[0] ? mapTool(rows[0]) : null;
}

export async function listCases(
  connectionId: string,
  toolName?: string,
): Promise<TestCase[]> {
  const t = tables();
  const db = getDb() as any;
  const cond = toolName
    ? and(eq(t.testCases.connectionId, connectionId), eq(t.testCases.toolName, toolName))
    : eq(t.testCases.connectionId, connectionId);
  const rows = await db
    .select()
    .from(t.testCases)
    .where(cond)
    .orderBy(desc(t.testCases.updatedAt));
  return rows.map(mapCase);
}

export async function getCase(id: string): Promise<TestCase | null> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db.select().from(t.testCases).where(eq(t.testCases.id, id)).limit(1);
  return rows[0] ? mapCase(rows[0]) : null;
}

export async function createCase(
  connectionId: string,
  toolName: string,
  input: CreateTestCaseInput,
): Promise<TestCase> {
  const t = tables();
  const db = getDb() as any;
  const id = newId();
  const ts = nowIso();
  const row = {
    id,
    connectionId,
    toolName,
    name: input.name,
    description: input.description ?? null,
    argumentsJson: jsonStringify(input.arguments ?? {}),
    assertJson: jsonStringify(normalizeAssert(input.assert)),
    tagsJson: jsonStringify(input.tags ?? []),
    enabled: input.enabled ?? true,
    createdAt: ts,
    updatedAt: ts,
  };
  await db.insert(t.testCases).values(row);
  return mapCase(row);
}

export async function updateCase(
  id: string,
  input: UpdateTestCaseInput,
): Promise<TestCase | null> {
  const existing = await getCase(id);
  if (!existing) return null;
  const t = tables();
  const db = getDb() as any;
  const patch: Record<string, unknown> = { updatedAt: nowIso() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.arguments !== undefined) patch.argumentsJson = jsonStringify(input.arguments);
  if (input.assert !== undefined) patch.assertJson = jsonStringify(normalizeAssert(input.assert));
  if (input.tags !== undefined) patch.tagsJson = jsonStringify(input.tags);
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  await db.update(t.testCases).set(patch).where(eq(t.testCases.id, id));
  return getCase(id);
}

export async function deleteCase(id: string): Promise<boolean> {
  const t = tables();
  const db = getDb() as any;
  await db.delete(t.testCases).where(eq(t.testCases.id, id));
  return true;
}

export async function createRun(input: {
  connectionId: string;
  toolName: string;
  testCaseId?: string | null;
  suiteRunId?: string | null;
  source: RunSource;
  requestArguments: Record<string, unknown>;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  isError: boolean;
  resultContent: ContentItem[];
  resultStructured?: unknown;
  protocolError?: Record<string, unknown> | null;
  assertResult?: AssertResult | null;
  schemaValidation?: SchemaValidationResult | null;
  rawResponse?: unknown;
}): Promise<InvocationRun> {
  const t = tables();
  const db = getDb() as any;
  const id = newId();
  const createdAt = nowIso();
  const row = {
    id,
    connectionId: input.connectionId,
    toolName: input.toolName,
    testCaseId: input.testCaseId ?? null,
    suiteRunId: input.suiteRunId ?? null,
    source: input.source,
    requestArgumentsJson: jsonStringify(input.requestArguments),
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    status: input.status,
    isError: input.isError,
    resultContentJson: jsonStringify(input.resultContent),
    resultStructuredJson:
      input.resultStructured === undefined
        ? null
        : jsonStringify(input.resultStructured),
    protocolErrorJson: input.protocolError ? jsonStringify(input.protocolError) : null,
    assertResultJson: input.assertResult ? jsonStringify(input.assertResult) : null,
    schemaValidationJson: input.schemaValidation
      ? jsonStringify(input.schemaValidation)
      : null,
    rawResponseJson:
      input.rawResponse === undefined ? null : jsonStringify(input.rawResponse),
    createdAt,
  };
  await db.insert(t.invocationRuns).values(row);
  return mapRun(row);
}

export async function listRuns(filter: {
  connectionId?: string;
  toolName?: string;
  suiteRunId?: string;
  status?: string;
  limit?: number;
}): Promise<InvocationRun[]> {
  const t = tables();
  const db = getDb() as any;
  const conds = [];
  if (filter.connectionId) conds.push(eq(t.invocationRuns.connectionId, filter.connectionId));
  if (filter.toolName) conds.push(eq(t.invocationRuns.toolName, filter.toolName));
  if (filter.suiteRunId) conds.push(eq(t.invocationRuns.suiteRunId, filter.suiteRunId));
  if (filter.status) conds.push(eq(t.invocationRuns.status, filter.status));
  const q = db.select().from(t.invocationRuns);
  const rows = conds.length
    ? await q
        .where(and(...conds))
        .orderBy(desc(t.invocationRuns.startedAt))
        .limit(filter.limit ?? 100)
    : await q.orderBy(desc(t.invocationRuns.startedAt)).limit(filter.limit ?? 100);
  return rows.map(mapRun);
}

export async function getRun(id: string): Promise<InvocationRun | null> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db
    .select()
    .from(t.invocationRuns)
    .where(eq(t.invocationRuns.id, id))
    .limit(1);
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function deleteRun(id: string): Promise<boolean> {
  const t = tables();
  const db = getDb() as any;
  await db.delete(t.invocationRuns).where(eq(t.invocationRuns.id, id));
  return true;
}

export async function createSuiteRun(input: {
  connectionId?: string | null;
  name?: string | null;
  filter?: Record<string, unknown> | null;
  total: number;
}): Promise<SuiteRun> {
  const t = tables();
  const db = getDb() as any;
  const id = newId();
  const ts = nowIso();
  const row = {
    id,
    connectionId: input.connectionId ?? null,
    name: input.name ?? null,
    filterJson: input.filter ? jsonStringify(input.filter) : null,
    startedAt: ts,
    endedAt: null,
    durationMs: null,
    total: input.total,
    passed: 0,
    failed: 0,
    skipped: 0,
    status: "running",
    createdAt: ts,
  };
  await db.insert(t.suiteRuns).values(row);
  return mapSuite(row);
}

export async function updateSuiteRun(
  id: string,
  patch: Partial<{
    endedAt: string | null;
    durationMs: number | null;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    status: SuiteStatus;
  }>,
): Promise<SuiteRun | null> {
  const t = tables();
  const db = getDb() as any;
  await db.update(t.suiteRuns).set(patch).where(eq(t.suiteRuns.id, id));
  return getSuiteRun(id);
}

export async function getSuiteRun(id: string): Promise<SuiteRun | null> {
  const t = tables();
  const db = getDb() as any;
  const rows = await db.select().from(t.suiteRuns).where(eq(t.suiteRuns.id, id)).limit(1);
  return rows[0] ? mapSuite(rows[0]) : null;
}

export async function listSuiteRuns(connectionId?: string): Promise<SuiteRun[]> {
  const t = tables();
  const db = getDb() as any;
  const rows = connectionId
    ? await db
        .select()
        .from(t.suiteRuns)
        .where(eq(t.suiteRuns.connectionId, connectionId))
        .orderBy(desc(t.suiteRuns.createdAt))
        .limit(50)
    : await db.select().from(t.suiteRuns).orderBy(desc(t.suiteRuns.createdAt)).limit(50);
  return rows.map(mapSuite);
}

export async function listCasesByFilter(filter: {
  connectionId: string;
  toolNames?: string[];
  caseIds?: string[];
  tags?: string[];
}): Promise<TestCase[]> {
  let cases = await listCases(filter.connectionId);
  if (filter.caseIds?.length) {
    const set = new Set(filter.caseIds);
    cases = cases.filter((c) => set.has(c.id));
  }
  if (filter.toolNames?.length) {
    const set = new Set(filter.toolNames);
    cases = cases.filter((c) => set.has(c.toolName));
  }
  if (filter.tags?.length) {
    cases = cases.filter((c) => filter.tags!.some((tag) => c.tags.includes(tag)));
  }
  return cases.filter((c) => c.enabled);
}
