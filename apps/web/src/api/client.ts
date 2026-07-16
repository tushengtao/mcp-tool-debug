import type {
  CreateConnectionInput,
  CreateTestCaseInput,
  ExportBundle,
  InvocationRun,
  InvokeResponse,
  McpConnection,
  McpTool,
  SuiteRun,
  SuiteRunRequest,
  TestCase,
  UpdateConnectionInput,
  UpdateTestCaseInput,
} from "@mcp-debug/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || res.statusText || "请求失败");
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; dialect: string }>("/api/health"),
  listConnections: () => request<McpConnection[]>("/api/connections"),
  createConnection: (body: CreateConnectionInput) =>
    request<McpConnection>("/api/connections", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateConnection: (id: string, body: UpdateConnectionInput) =>
    request<McpConnection>(`/api/connections/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteConnection: (id: string) =>
    request<{ ok: boolean }>(`/api/connections/${id}`, { method: "DELETE" }),
  connect: (id: string) =>
    request<McpConnection>(`/api/connections/${id}/connect`, { method: "POST" }),
  disconnect: (id: string) =>
    request<McpConnection>(`/api/connections/${id}/disconnect`, { method: "POST" }),
  syncTools: (id: string) =>
    request<{ count: number; tools: McpTool[] }>(`/api/connections/${id}/sync-tools`, {
      method: "POST",
    }),
  listTools: (id: string, q?: string) =>
    request<McpTool[]>(
      `/api/connections/${id}/tools${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    ),
  getTool: (id: string, toolName: string) =>
    request<McpTool>(`/api/connections/${id}/tools/${encodeURIComponent(toolName)}`),
  invoke: (
    id: string,
    toolName: string,
    body: { arguments?: Record<string, unknown>; save?: boolean },
  ) =>
    request<InvokeResponse>(
      `/api/connections/${id}/tools/${encodeURIComponent(toolName)}/invoke`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  listCases: (id: string, toolName: string) =>
    request<TestCase[]>(
      `/api/connections/${id}/tools/${encodeURIComponent(toolName)}/cases`,
    ),
  listAllCases: (id: string) => request<TestCase[]>(`/api/connections/${id}/cases`),
  createCase: (id: string, toolName: string, body: CreateTestCaseInput) =>
    request<TestCase>(
      `/api/connections/${id}/tools/${encodeURIComponent(toolName)}/cases`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updateCase: (caseId: string, body: UpdateTestCaseInput) =>
    request<TestCase>(`/api/cases/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteCase: (caseId: string) =>
    request<{ ok: boolean }>(`/api/cases/${caseId}`, { method: "DELETE" }),
  runCase: (caseId: string) =>
    request<InvokeResponse>(`/api/cases/${caseId}/run`, { method: "POST" }),
  runSuite: (id: string, body: SuiteRunRequest) =>
    request<SuiteRun>(`/api/connections/${id}/suites/run`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  listSuiteRuns: (connectionId?: string) =>
    request<SuiteRun[]>(
      `/api/suite-runs${connectionId ? `?connectionId=${connectionId}` : ""}`,
    ),
  getSuiteRun: (id: string) =>
    request<{ suite: SuiteRun; runs: InvocationRun[] }>(`/api/suite-runs/${id}`),
  listRuns: (params: {
    connectionId?: string;
    toolName?: string;
    suiteRunId?: string;
    status?: string;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") q.set(k, String(v));
    });
    return request<InvocationRun[]>(`/api/runs?${q.toString()}`);
  },
  getRun: (id: string) => request<InvocationRun>(`/api/runs/${id}`),
  deleteRun: (id: string) =>
    request<{ ok: boolean }>(`/api/runs/${id}`, { method: "DELETE" }),
  exportAll: () => request<ExportBundle>("/api/export"),
  importAll: (body: ExportBundle) =>
    request<{ connections: number; cases: number }>("/api/import", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
