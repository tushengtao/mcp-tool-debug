export type TransportType = "streamable_http" | "sse" | "auto";

export type RunSource = "manual" | "case" | "suite";

export type RunStatus =
  | "success"
  | "tool_error"
  | "protocol_error"
  | "timeout"
  | "cancelled";

export type SuiteStatus = "running" | "cancelling" | "passed" | "failed" | "cancelled";

export interface JsonPathEquals {
  path: string;
  value: unknown;
}

export interface AssertConfig {
  expectIsError?: boolean;
  expectStructured?: boolean;
  structuredEquals?: Record<string, unknown> | unknown;
  structuredSchemaValid?: boolean;
  contentTextContains?: string[];
  contentTextNotContains?: string[];
  maxDurationMs?: number;
  jsonPathEquals?: JsonPathEquals[];
}

export interface AssertCheck {
  name: string;
  passed: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface AssertResult {
  passed: boolean;
  checks: AssertCheck[];
}

export interface SchemaValidationResult {
  ok: boolean;
  errors: Array<{ path: string; message: string }>;
}

export interface ErrorObject {
  instancePath?: string;
  schemaPath?: string;
  message?: string;
}

export interface McpConnection {
  id: string;
  name: string;
  description?: string | null;
  transport: TransportType;
  url: string;
  /** Configured HTTP header names. Secret values are never returned by connection APIs. */
  headerNames: string[];
  timeoutMs: number;
  enabled: boolean;
  lastConnectedAt?: string | null;
  lastError?: string | null;
  serverInfo?: Record<string, unknown> | null;
  live?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConnectionInput {
  name: string;
  description?: string;
  transport?: TransportType;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface UpdateConnectionInput {
  name?: string;
  description?: string | null;
  transport?: TransportType;
  url?: string;
  /** Replaces every configured header. Prefer headerPatch for redacted edit forms. */
  headers?: Record<string, string>;
  /** Adds/replaces individual headers; null removes a header. Header names are matched case-insensitively. */
  headerPatch?: Record<string, string | null>;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface McpTool {
  id: string;
  connectionId: string;
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown> | null;
  annotations?: Record<string, unknown> | null;
  raw?: Record<string, unknown> | null;
  syncedAt: string;
}

export interface TestCase {
  id: string;
  connectionId: string;
  toolName: string;
  name: string;
  description?: string | null;
  arguments: Record<string, unknown>;
  assert: AssertConfig;
  tags: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTestCaseInput {
  name: string;
  description?: string;
  arguments?: Record<string, unknown>;
  assert?: AssertConfig;
  tags?: string[];
  enabled?: boolean;
}

export interface UpdateTestCaseInput {
  name?: string;
  description?: string | null;
  arguments?: Record<string, unknown>;
  assert?: AssertConfig;
  tags?: string[];
  enabled?: boolean;
}

export interface ContentItem {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
  description?: string;
  resource?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface InvocationRun {
  id: string;
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
  createdAt: string;
}

export interface InvocationRunSummary {
  id: string;
  connectionId: string;
  toolName: string;
  testCaseId?: string | null;
  suiteRunId?: string | null;
  source: RunSource;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  isError: boolean;
  passed: boolean;
  assertPassed?: boolean | null;
  schemaValid?: boolean | null;
  hasProtocolError: boolean;
}

export interface TestCaseOverview extends TestCase {
  lastRun?: InvocationRunSummary | null;
}

export interface SuiteRun {
  id: string;
  connectionId?: string | null;
  name?: string | null;
  filter?: Record<string, unknown> | null;
  startedAt: string;
  endedAt?: string | null;
  durationMs?: number | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  status: SuiteStatus;
  createdAt: string;
}

export interface SuiteRunProgress {
  suite: SuiteRun;
  runs: InvocationRunSummary[];
}

export interface InvokeRequest {
  arguments?: Record<string, unknown>;
  save?: boolean;
  testCaseId?: string;
}

export interface InvokeResponse {
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  isError: boolean;
  content: ContentItem[];
  structuredContent?: unknown;
  schemaValidation?: SchemaValidationResult | null;
  assertResult?: AssertResult | null;
  protocolError?: Record<string, unknown> | null;
}

export interface SuiteRunRequest {
  toolNames?: string[];
  caseIds?: string[];
  tags?: string[];
  parallel?: number;
  name?: string;
}

export interface StartSuiteRunRequest {
  caseIds: string[];
  parallel?: number;
  name?: string;
}

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  connections: Array<
    Omit<
      McpConnection,
      "headerNames" | "live" | "lastConnectedAt" | "lastError" | "serverInfo"
    > & {
      headers: Record<string, string>;
      cases: TestCase[];
    }
  >;
}
