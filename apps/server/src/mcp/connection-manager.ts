import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  ContentItem,
  McpConnection,
  RunStatus,
  SchemaValidationResult,
  TransportType,
} from "@mcp-debug/shared";
import * as repo from "../db/repos.js";
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

  private buildHeaders(conn: McpConnection): HeadersInit | undefined {
    const headers = conn.headers ?? {};
    if (!Object.keys(headers).length) return undefined;
    return headers;
  }

  private async connectWithTransport(
    conn: McpConnection,
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

  async connect(id: string): Promise<McpConnection> {
    const conn = await repo.getConnection(id);
    if (!conn) throw new Error("连接不存在");
    if (this.sessions.has(id)) {
      await this.disconnect(id);
    }

    const tryOrder: Array<"streamable_http" | "sse"> =
      conn.transport === "streamable_http"
        ? ["streamable_http"]
        : conn.transport === "sse"
          ? ["sse"]
          : ["streamable_http", "sse"];

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
    try {
      if (
        session.transport &&
        typeof (session.transport as any).terminateSession === "function"
      ) {
        await (session.transport as any).terminateSession().catch(() => undefined);
      }
      await session.client.close();
    } catch {
      // ignore
    }
  }

  async ensureConnected(id: string): Promise<LiveSession> {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    await this.connect(id);
    const session = this.sessions.get(id);
    if (!session) throw new Error("连接失败");
    return session;
  }

  async syncTools(id: string) {
    return this.withQueue(id, async () => {
      const session = await this.ensureConnected(id);
      const tools: any[] = [];
      let cursor: string | undefined;
      do {
        const res = await session.client.listTools(
          cursor ? { cursor } : undefined,
        );
        tools.push(...(res.tools ?? []));
        cursor = res.nextCursor;
      } while (cursor);

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

      const startedAtMs = Date.now();
      const startedAt = new Date(startedAtMs).toISOString();
      let session: LiveSession;
      try {
        session = await this.ensureConnected(connectionId);
      } catch (err) {
        const endedAtMs = Date.now();
        return {
          startedAt,
          endedAt: new Date(endedAtMs).toISOString(),
          durationMs: endedAtMs - startedAtMs,
          status: "protocol_error",
          isError: true,
          content: [],
          protocolError: {
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        // SDK callTool may not accept abort; race with timeout promise
        const resultPromise = session.client.callTool({
          name: toolName,
          arguments: args,
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("Tool call timed out"), { code: "TIMEOUT" }));
          });
        });
        const result = await Promise.race([resultPromise, timeoutPromise]);
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
    });
  }
}

export const connectionManager = new ConnectionManager();
