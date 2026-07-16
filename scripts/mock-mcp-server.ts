import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
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
  throw new Error(`Unknown tool: ${name}`);
});

const transports = new Map<string, StreamableHTTPServerTransport>();

async function getTransport(sessionId: string | undefined) {
  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId ?? crypto.randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (sid) => {
      transports.set(sid, transport);
    },
  });
  transport.onclose = () => {
    if (transport.sessionId) transports.delete(transport.sessionId);
  };
  await server.connect(transport);
  return transport;
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
  if (req.url !== "/mcp") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const transport = await getTransport(sessionId);
    if (req.method === "POST" || req.method === "GET" || req.method === "DELETE") {
      const body = req.method === "POST" ? await readBody(req) : undefined;
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

httpServer.listen(9999, () => {
  console.log("[mock-mcp] listening on http://localhost:9999/mcp");
});
