import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const mcpConnections = pgTable("mcp_connections", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  transport: text("transport").notNull().default("auto"),
  url: text("url").notNull(),
  headersJson: text("headers_json").notNull().default("{}"),
  timeoutMs: integer("timeout_ms").notNull().default(60000),
  enabled: boolean("enabled").notNull().default(true),
  lastConnectedAt: text("last_connected_at"),
  lastError: text("last_error"),
  serverInfoJson: text("server_info_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mcpTools = pgTable(
  "mcp_tools",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => mcpConnections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    description: text("description"),
    inputSchemaJson: text("input_schema_json").notNull().default("{}"),
    outputSchemaJson: text("output_schema_json"),
    annotationsJson: text("annotations_json"),
    rawJson: text("raw_json"),
    syncedAt: text("synced_at").notNull(),
  },
  (t) => ({
    connToolUnique: uniqueIndex("mcp_tools_conn_name_uq").on(t.connectionId, t.name),
    connIdx: index("mcp_tools_conn_idx").on(t.connectionId),
  }),
);

export const testCases = pgTable(
  "test_cases",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => mcpConnections.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    argumentsJson: text("arguments_json").notNull().default("{}"),
    assertJson: text("assert_json").notNull().default("{}"),
    tagsJson: text("tags_json").notNull().default("[]"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => ({
    connToolIdx: index("test_cases_conn_tool_idx").on(t.connectionId, t.toolName),
  }),
);

export const suiteRuns = pgTable("suite_runs", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id").references(() => mcpConnections.id, {
    onDelete: "set null",
  }),
  name: text("name"),
  filterJson: text("filter_json"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationMs: integer("duration_ms"),
  total: integer("total").notNull().default(0),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  status: text("status").notNull().default("running"),
  createdAt: text("created_at").notNull(),
});

export const invocationRuns = pgTable(
  "invocation_runs",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => mcpConnections.id, { onDelete: "cascade" }),
    toolName: text("tool_name").notNull(),
    testCaseId: text("test_case_id"),
    suiteRunId: text("suite_run_id"),
    source: text("source").notNull().default("manual"),
    requestArgumentsJson: text("request_arguments_json").notNull().default("{}"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at").notNull(),
    durationMs: integer("duration_ms").notNull().default(0),
    status: text("status").notNull(),
    isError: boolean("is_error").notNull().default(false),
    resultContentJson: text("result_content_json").notNull().default("[]"),
    resultStructuredJson: text("result_structured_json"),
    protocolErrorJson: text("protocol_error_json"),
    assertResultJson: text("assert_result_json"),
    schemaValidationJson: text("schema_validation_json"),
    rawResponseJson: text("raw_response_json"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    connToolIdx: index("invocation_runs_conn_tool_idx").on(t.connectionId, t.toolName),
    startedIdx: index("invocation_runs_started_idx").on(t.startedAt),
    suiteIdx: index("invocation_runs_suite_idx").on(t.suiteRunId),
  }),
);

export const pgSchema = {
  mcpConnections,
  mcpTools,
  testCases,
  suiteRuns,
  invocationRuns,
};
