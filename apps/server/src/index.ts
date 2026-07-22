import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { migrate } from "./db/client.js";
import api from "./routes/api.js";
import { reconcileInterruptedSuiteRuns } from "./db/repos.js";

const port = Number(process.env.PORT ?? 8787);
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

async function main() {
  await migrate();
  const reconciledSuites = await reconcileInterruptedSuiteRuns();
  if (reconciledSuites > 0) {
    console.warn(JSON.stringify({
      event: "interrupted_suite_runs_reconciled",
      count: reconciledSuites,
    }));
  }

  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: corsOrigin,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.route("/api", api);
  app.get("/", (c) =>
    c.json({
      name: "mcp-tool-debug",
      docs: "/api/health",
    }),
  );

  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[mcp-tool-debug] API listening on http://localhost:${info.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
