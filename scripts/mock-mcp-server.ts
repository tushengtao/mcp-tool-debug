import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const port = Number(process.env.MOCK_MCP_PORT ?? 9999);
const sessionMode = process.env.MOCK_MCP_SESSION_MODE ?? "normal";
const slowToolDelayMs = Number(process.env.MOCK_MCP_SLOW_DELAY_MS ?? 150);
const stats = {
  initializedSessions: 0,
  sessionNotFoundResponses: 0,
  listToolsCalls: 0,
  toolCalls: 0,
};
let expireOnceConsumed = false;

function createMcpServer() {
  const server = new Server(
    {
      name: "mock-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: { listChanged: false },
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    stats.listToolsCalls += 1;
    return {
      tools: [
        {
          name: "echo",
          title: "Echo Tool",
          description: "Echoes input message and supports structured output",
          inputSchema: {
            type: "object",
            properties: {
              message: { type: "string" },
              details: { type: "object" },
            },
            required: ["message"],
          },
          outputSchema: {
            type: "object",
            properties: {
              echoed: { type: "string" },
              length: { type: "number" },
              details: { type: "object" },
            },
            required: ["echoed", "length"],
          },
        },
        {
          name: "greet",
          title: "Greet Tool",
          description: "Returns a markdown greeting",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
        },
        {
          name: "ping",
          title: "Ping",
          description: "No parameters tool",
          inputSchema: {
            type: "object",
            additionalProperties: false,
          },
        },
        {
          name: "fail",
          title: "Fail",
          description: "Returns a tool-level error",
          inputSchema: {
            type: "object",
            additionalProperties: false,
          },
        },
        {
          name: "slow",
          title: "Slow",
          description: "Returns after a configurable delay",
          inputSchema: {
            type: "object",
            additionalProperties: false,
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    stats.toolCalls += 1;
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    if (name === "echo") {
      const msg = String(args.message ?? "");
      const details = (args.details as Record<string, unknown>) ?? {};
      const structured = {
        echoed: msg,
        length: msg.length,
        details,
      };
      return {
        content: [{ type: "text", text: `Echo: ${msg}` }],
        structuredContent: structured,
        isError: false,
      };
    }
    if (name === "greet") {
      const nameStr = String(args.name ?? "World");
      return {
        content: [
          { type: "text", text: `## Hello **${nameStr}**\nNice to meet you!` },
        ],
        isError: false,
      };
    }
    if (name === "ping") {
      return {
        content: [{ type: "text", text: "pong" }],
        isError: false,
      };
    }
    if (name === "fail") {
      return {
        content: [{ type: "text", text: "expected failure" }],
        isError: true,
      };
    }
    if (name === "slow") {
      await new Promise((resolve) => setTimeout(resolve, slowToolDelayMs));
      return {
        content: [{ type: "text", text: "slow response" }],
        isError: false,
      };
    }
    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

const transports = new Map<string, StreamableHTTPServerTransport>();

async function createTransport() {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
      stats.initializedSessions += 1;
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  await server.connect(transport);
  return transport;
}

function isJsonRpcRequest(body: unknown): boolean {
  return Boolean(
    body &&
      typeof body === "object" &&
      "method" in body &&
      "id" in body &&
      (body as { id?: unknown }).id !== undefined,
  );
}

function writeJsonRpcError(
  res: ServerResponse,
  status: number,
  message: string,
) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "server-error",
      error: { code: -32600, message },
    }),
  );
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : undefined);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? "/", "http://localhost");
  if (requestUrl.pathname === "/stats" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }
  if (requestUrl.pathname !== "/mcp") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (req.method === "POST" || req.method === "GET" || req.method === "DELETE") {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const sessionRequest = Boolean(sessionId) && isJsonRpcRequest(body);

      if (sessionId && !transports.has(sessionId)) {
        stats.sessionNotFoundResponses += 1;
        writeJsonRpcError(res, 404, "Session not found");
        return;
      }

      if (
        sessionRequest &&
        sessionMode === "expire-once" &&
        !expireOnceConsumed
      ) {
        expireOnceConsumed = true;
        transports.delete(sessionId!);
        stats.sessionNotFoundResponses += 1;
        writeJsonRpcError(res, 404, "Session not found");
        return;
      }
      if (sessionRequest && sessionMode === "reject-requests") {
        transports.delete(sessionId!);
        stats.sessionNotFoundResponses += 1;
        writeJsonRpcError(res, 404, "Session not found");
        return;
      }
      if (sessionRequest && sessionMode === "http-401") {
        writeJsonRpcError(res, 401, "Unauthorized");
        return;
      }
      if (sessionRequest && sessionMode === "http-500") {
        writeJsonRpcError(res, 500, "Internal server error");
        return;
      }

      const transport = sessionId
        ? transports.get(sessionId)!
        : await createTransport();
      await transport.handleRequest(req, res, body);
    } else {
      res.writeHead(405);
      res.end("method not allowed");
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(String(err));
    }
  }
});

httpServer.listen(port, "127.0.0.1", () => {
  console.log(`[mock-mcp] listening on http://127.0.0.1:${port}/mcp`);
});
