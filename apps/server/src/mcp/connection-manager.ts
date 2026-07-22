import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  ContentItem,
  RunStatus,
  SchemaValidationResult,
  TransportType,
} from "@mcp-debug/shared";
import * as repo from "../db/repos.js";
import type { StoredMcpConnection } from "../db/repos.js";
import { validateAgainstSchema } from "../services/schema-validate.js";
import { nowIso } from "../util/id.js";

interface LiveSession {
  client: Client;
  transport: Transport;
  transportUsed: Exclude<TransportType, "auto">;
  connectedAt: string;
}

export interface CallToolResult {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: RunStatus;
  isError: boolean;
  content: ContentItem[];
  structuredContent?: unknown;
  protocolError?: Record<string, unknown> | null;
  schemaValidation?: SchemaValidationResult | null;
  rawResponse?: unknown;
}

export interface ExecutionWorker {
  callTool(toolName: string, args: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

class ConnectionManager {
  private sessions = new Map<string, LiveSession>();
  private queues = new Map<string, Promise<unknown>>();

  isLive(id: string): boolean {
    return this.sessions.has(id);
  }

  liveIds(): Set<string> {
    return new Set(this.sessions.keys());
  }

  private async withQueue<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    this.queues.set(
      id,
      prev.then(() => gate).catch(() => gate),
    );
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private buildHeaders(conn: StoredMcpConnection): HeadersInit | undefined {
    const headers = conn.headers ?? {};
    if (!Object.keys(headers).length) return undefined;
    return headers;
  }

  private async connectWithTransport(
    conn: StoredMcpConnection,
    kind: "streamable_http" | "sse",
  ): Promise<LiveSession> {
    const client = new Client({ name: "mcp-tool-debug", version: "0.1.0" });
    const url = new URL(conn.url);
    const requestInit = { headers: this.buildHeaders(conn) };
    let transport: Transport;
    if (kind === "streamable_http") {
      transport = new StreamableHTTPClientTransport(url, {
        requestInit,
      });
    } else {
      transport = new SSEClientTransport(url, {
        requestInit,
      });
    }
    await client.connect(transport);
    return {
      client,
      transport,
      transportUsed: kind,
      connectedAt: nowIso(),
    };
  }

  private transportOrder(conn: StoredMcpConnection): Array<"streamable_http" | "sse"> {
    return conn.transport === "streamable_http"
      ? ["streamable_http"]
      : conn.transport === "sse"
        ? ["sse"]
        : ["streamable_http", "sse"];
  }

  private async connectStoredConnection(conn: StoredMcpConnection): Promise<LiveSession> {
    let lastError: unknown;
    for (const kind of this.transportOrder(conn)) {
      try {
        return await this.connectWithTransport(conn, kind);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "connect failed"));
  }

  private async closeSession(session: LiveSession, terminate = true): Promise<void> {
    try {
      if (
        terminate &&
        session.transport &&
        typeof (session.transport as any).terminateSession === "function"
      ) {
        await (session.transport as any).terminateSession().catch(() => undefined);
      }
      await session.client.close();
    } catch {
      // ignore cleanup failures
    }
  }

  async connect(id: string): Promise<StoredMcpConnection> {
    const conn = await repo.getConnection(id);
    if (!conn) throw new Error("连接不存在");
    if (this.sessions.has(id)) {
      await this.disconnect(id);
    }

    const tryOrder = this.transportOrder(conn);

    let lastErr: unknown;
    for (const kind of tryOrder) {
      try {
        const session = await this.connectWithTransport(conn, kind);
        this.sessions.set(id, session);
        const serverInfo = {
          transportUsed: kind,
          // client.getServerVersion may exist depending on sdk
          ...(typeof (session.client as any).getServerVersion === "function"
            ? { serverVersion: (session.client as any).getServerVersion() }
            : {}),
          ...(typeof (session.client as any).getServerCapabilities === "function"
            ? { capabilities: (session.client as any).getServerCapabilities() }
            : {}),
        };
        await repo.markConnectionStatus(id, {
          lastConnectedAt: session.connectedAt,
          lastError: null,
          serverInfo,
        });
        return (await repo.getConnection(id, true))!;
      } catch (err) {
        lastErr = err;
      }
    }
    const message =
      lastErr instanceof Error ? lastErr.message : String(lastErr ?? "connect failed");
    await repo.markConnectionStatus(id, {
      lastConnectedAt: null,
      lastError: message,
    });
    throw new Error(message);
  }

  async disconnect(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    await this.closeSession(session);
  }

  async ensureConnected(id: string): Promise<LiveSession> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    await this.connect(id);
    const session = this.sessions.get(id);
    if (!session) throw new Error("连接失败");
    return session;
  }

  private isExpiredStreamableSession(
    session: LiveSession,
    error: unknown,
  ): boolean {
    if (session.transportUsed !== "streamable_http") return false;
    const transport = session.transport as StreamableHTTPClientTransport;
    return (
      Boolean(transport.sessionId) &&
      error instanceof StreamableHTTPError &&
      error.code === 404
    );
  }

  private async discardSession(id: string, session: LiveSession): Promise<void> {
    if (this.sessions.get(id) === session) {
      this.sessions.delete(id);
    }
    // The upstream server already rejected this session ID. Close the local
    // transport only; sending DELETE with the stale ID cannot recover it.
    await session.client.close().catch(() => undefined);
  }

  private async markSessionUnavailable(id: string, error: unknown): Promise<void> {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      error instanceof StreamableHTTPError && error.code
        ? `HTTP ${error.code}: ${detail}`
        : detail;
    await repo.markConnectionStatus(id, {
      lastConnectedAt: null,
      lastError: message,
    });
  }

  private async withSessionRecovery<T>(
    id: string,
    operation: (session: LiveSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.ensureConnected(id);
    try {
      return await operation(session);
    } catch (error) {
      if (!this.isExpiredStreamableSession(session, error)) throw error;

      console.warn(
        JSON.stringify({
          event: "mcp_session_recovery_started",
          connectionId: id,
          reason: "http_404",
        }),
      );
      await this.discardSession(id, session);

      let replacement: LiveSession;
      try {
        await this.connect(id);
        replacement = this.sessions.get(id)!;
        if (!replacement) throw new Error("MCP session recovery failed");
      } catch (reconnectError) {
        console.warn(
          JSON.stringify({
            event: "mcp_session_recovery_failed",
            connectionId: id,
            stage: "initialize",
          }),
        );
        throw reconnectError;
      }

      try {
        const result = await operation(replacement);
        console.info(
          JSON.stringify({
            event: "mcp_session_recovery_succeeded",
            connectionId: id,
          }),
        );
        return result;
      } catch (retryError) {
        if (this.isExpiredStreamableSession(replacement, retryError)) {
          await this.discardSession(id, replacement);
          await this.markSessionUnavailable(id, retryError);
          console.warn(
            JSON.stringify({
              event: "mcp_session_recovery_failed",
              connectionId: id,
              stage: "retry",
            }),
          );
        }
        throw retryError;
      }
    }
  }

  async syncTools(id: string) {
    return this.withQueue(id, async () => {
      const tools = await this.withSessionRecovery(id, async (session) => {
        const collected: any[] = [];
        let cursor: string | undefined;
        do {
          const res = await session.client.listTools(
            cursor ? { cursor } : undefined,
          );
          collected.push(...(res.tools ?? []));
          cursor = res.nextCursor;
        } while (cursor);
        return collected;
      });

      return repo.replaceTools(
        id,
        tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          raw: tool,
        })),
      );
    });
  }

  private async executeToolCall(
    tool: Awaited<ReturnType<typeof repo.getTool>>,
    timeoutMs: number,
    operation: () => Promise<any>,
  ): Promise<CallToolResult> {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("Tool call timed out"), { code: "TIMEOUT" }));
        });
      });
      const result = await Promise.race([operation(), timeoutPromise]);
      const endedAtMs = Date.now();
      const content = (Array.isArray((result as any).content)
        ? (result as any).content
        : []) as ContentItem[];
      const structuredContent = (result as any).structuredContent;
      const isError = Boolean((result as any).isError);
      const schemaValidation = validateAgainstSchema(
        tool?.outputSchema as Record<string, unknown> | null | undefined,
        structuredContent,
      );
      return {
        startedAt,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - startedAtMs,
        status: isError ? "tool_error" : "success",
        isError,
        content,
        structuredContent,
        schemaValidation,
        protocolError: null,
        rawResponse: result,
      };
    } catch (err: any) {
      const endedAtMs = Date.now();
      const isTimeout =
        err?.code === "TIMEOUT" ||
        err?.name === "AbortError" ||
        /timed out/i.test(String(err?.message ?? ""));
      return {
        startedAt,
        endedAt: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - startedAtMs,
        status: isTimeout ? "timeout" : "protocol_error",
        isError: true,
        content: [],
        protocolError: {
          message: err instanceof Error ? err.message : String(err),
          code: err?.code,
        },
        schemaValidation: null,
        rawResponse: null,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async createExecutionWorker(connectionId: string): Promise<ExecutionWorker> {
    const conn = await repo.getConnection(connectionId);
    if (!conn) throw new Error("连接不存在");
    let session: LiveSession | null = null;
    let closed = false;

    const invoke = async (toolName: string, args: Record<string, unknown>) => {
      if (closed) throw new Error("Execution worker is closed");
      if (!session) session = await this.connectStoredConnection(conn);
      const current = session;
      try {
        return await current.client.callTool({ name: toolName, arguments: args });
      } catch (error) {
        if (!this.isExpiredStreamableSession(current, error)) throw error;
        console.warn(JSON.stringify({
          event: "mcp_worker_session_recovery_started",
          connectionId,
          reason: "http_404",
        }));
        await this.closeSession(current, false);
        session = await this.connectStoredConnection(conn);
        try {
          const result = await session.client.callTool({ name: toolName, arguments: args });
          console.info(JSON.stringify({
            event: "mcp_worker_session_recovery_succeeded",
            connectionId,
          }));
          return result;
        } catch (retryError) {
          if (session && this.isExpiredStreamableSession(session, retryError)) {
            await this.closeSession(session, false);
            session = null;
          }
          console.warn(JSON.stringify({
            event: "mcp_worker_session_recovery_failed",
            connectionId,
          }));
          throw retryError;
        }
      }
    };

    return {
      callTool: async (toolName, args) => {
        const tool = await repo.getTool(connectionId, toolName);
        return this.executeToolCall(
          tool,
          conn.timeoutMs ?? 60000,
          () => invoke(toolName, args),
        );
      },
      close: async () => {
        closed = true;
        if (session) await this.closeSession(session);
        session = null;
      },
    };
  }

  async callTool(
    connectionId: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ): Promise<CallToolResult> {
    return this.withQueue(connectionId, async () => {
      const conn = await repo.getConnection(connectionId);
      if (!conn) throw new Error("连接不存在");
      const timeoutMs = options?.timeoutMs ?? conn.timeoutMs ?? 60000;
      const tool = await repo.getTool(connectionId, toolName);
      return this.executeToolCall(
        tool,
        timeoutMs,
        () => this.withSessionRecovery(connectionId, (session) =>
          session.client.callTool({ name: toolName, arguments: args })),
      );
    });
  }
}

export const connectionManager = new ConnectionManager();
