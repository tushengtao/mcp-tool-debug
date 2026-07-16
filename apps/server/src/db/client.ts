import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pgPkg from "pg";
const { Pool } = pgPkg;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sqliteSchema from "./schema.sqlite.js";
import * as pgSchema from "./schema.pg.js";

export type DbDialect = "sqlite" | "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "../..");

function inferDialect(url: string): DbDialect {
  if (process.env.DB_DIALECT === "postgres" || process.env.DB_DIALECT === "sqlite") {
    return process.env.DB_DIALECT;
  }
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgres";
  }
  return "sqlite";
}

function resolveSqlitePath(url: string): string {
  if (url.startsWith("file:")) {
    const p = url.slice("file:".length);
    return path.isAbsolute(p) ? p : path.resolve(serverRoot, p);
  }
  return path.isAbsolute(url) ? url : path.resolve(serverRoot, url);
}

const databaseUrl =
  process.env.DATABASE_URL ?? `file:./data/mcp-debug.db`;
export const dialect = inferDialect(databaseUrl);

let sqliteDb: ReturnType<typeof drizzleSqlite> | null = null;
let pgDb: ReturnType<typeof drizzlePg> | null = null;
let pgPool: InstanceType<typeof Pool> | null = null;

export function getSqlite() {
  if (!sqliteDb) {
    const file = resolveSqlitePath(databaseUrl);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const client = new Database(file);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    sqliteDb = drizzleSqlite(client, { schema: sqliteSchema });
  }
  return sqliteDb;
}

export function getPg() {
  if (!pgDb) {
    pgPool = new Pool({ connectionString: databaseUrl });
    pgDb = drizzlePg(pgPool, { schema: pgSchema });
  }
  return pgDb;
}

export function getDb() {
  return dialect === "postgres" ? getPg() : getSqlite();
}

export { sqliteSchema, pgSchema };

const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL DEFAULT 'auto',
  url TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_connected_at TEXT,
  last_error TEXT,
  server_info_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT,
  annotations_json TEXT,
  raw_json TEXT,
  synced_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_tools_conn_name_uq ON mcp_tools(connection_id, name);
CREATE INDEX IF NOT EXISTS mcp_tools_conn_idx ON mcp_tools(connection_id);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  assert_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS test_cases_conn_tool_idx ON test_cases(connection_id, tool_name);

CREATE TABLE IF NOT EXISTS suite_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES mcp_connections(id) ON DELETE SET NULL,
  name TEXT,
  filter_json TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invocation_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  test_case_id TEXT,
  suite_run_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  request_arguments_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  result_content_json TEXT NOT NULL DEFAULT '[]',
  result_structured_json TEXT,
  protocol_error_json TEXT,
  assert_result_json TEXT,
  schema_validation_json TEXT,
  raw_response_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invocation_runs_conn_tool_idx ON invocation_runs(connection_id, tool_name);
CREATE INDEX IF NOT EXISTS invocation_runs_started_idx ON invocation_runs(started_at);
CREATE INDEX IF NOT EXISTS invocation_runs_suite_idx ON invocation_runs(suite_run_id);
`;

const PG_DDL = `
CREATE TABLE IF NOT EXISTS mcp_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL DEFAULT 'auto',
  url TEXT NOT NULL,
  headers_json TEXT NOT NULL DEFAULT '{}',
  timeout_ms INTEGER NOT NULL DEFAULT 60000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_connected_at TEXT,
  last_error TEXT,
  server_info_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  description TEXT,
  input_schema_json TEXT NOT NULL DEFAULT '{}',
  output_schema_json TEXT,
  annotations_json TEXT,
  raw_json TEXT,
  synced_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS mcp_tools_conn_name_uq ON mcp_tools(connection_id, name);
CREATE INDEX IF NOT EXISTS mcp_tools_conn_idx ON mcp_tools(connection_id);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  arguments_json TEXT NOT NULL DEFAULT '{}',
  assert_json TEXT NOT NULL DEFAULT '{}',
  tags_json TEXT NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS test_cases_conn_tool_idx ON test_cases(connection_id, tool_name);

CREATE TABLE IF NOT EXISTS suite_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT REFERENCES mcp_connections(id) ON DELETE SET NULL,
  name TEXT,
  filter_json TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invocation_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  test_case_id TEXT,
  suite_run_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  request_arguments_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  is_error BOOLEAN NOT NULL DEFAULT FALSE,
  result_content_json TEXT NOT NULL DEFAULT '[]',
  result_structured_json TEXT,
  protocol_error_json TEXT,
  assert_result_json TEXT,
  schema_validation_json TEXT,
  raw_response_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS invocation_runs_conn_tool_idx ON invocation_runs(connection_id, tool_name);
CREATE INDEX IF NOT EXISTS invocation_runs_started_idx ON invocation_runs(started_at);
CREATE INDEX IF NOT EXISTS invocation_runs_suite_idx ON invocation_runs(suite_run_id);
`;

export async function migrate() {
  if (dialect === "sqlite") {
    const file = resolveSqlitePath(databaseUrl);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const raw = new Database(file);
    raw.pragma("journal_mode = WAL");
    raw.pragma("foreign_keys = ON");
    raw.exec(SQLITE_DDL);
    raw.close();
    // ensure drizzle singleton opens after migrate
    getSqlite();
    return;
  }
  const pool = pgPool ?? new Pool({ connectionString: databaseUrl });
  await pool.query(PG_DDL);
  if (!pgPool) {
    // keep pool for getPg later by assigning
    pgPool = pool;
  }
}
