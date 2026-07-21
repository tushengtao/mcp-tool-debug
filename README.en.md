# MCP Tool Debug — Open-Source MCP Inspector & Automation Testing Workbench

[简体中文](README.md) | [English](README.en.md)

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](package.json)
[![MCP SDK](https://img.shields.io/badge/Model%20Context%20Protocol-SDK-6f42c1)](https://modelcontextprotocol.io/)
[![JSON Schema 2020-12](https://img.shields.io/badge/JSON%20Schema-2020--12-blue)](https://json-schema.org/draft/2020-12)
[![GitHub stars](https://img.shields.io/github/stars/tushengtao/mcp-tool-debug?style=flat&logo=github)](https://github.com/tushengtao/mcp-tool-debug)

**MCP Tool Debug** is a self-hosted web workbench for connecting to, inspecting, invoking, and regression-testing [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) Tools. It brings an MCP inspector, JSON Schema 2020-12 forms, result diagnostics, reusable test cases, and automation runs into one interface.

> Go from “Why did this Tool call fail?” to “Does the entire MCP integration still work after this release?” without switching tools.

## Why MCP Tool Debug?

The hard part of developing or integrating an MCP Server is rarely sending one JSON-RPC request. It is repeatedly diagnosing and reproducing the surrounding behavior:

| Pain point | How MCP Tool Debug helps |
| --- | --- |
| Complex `inputSchema` makes hand-written JSON error-prone | Generates JSON Schema 2020-12 forms with `oneOf`, `anyOf`, nested objects, and arrays, while retaining a raw JSON editor |
| HTTP, JSON-RPC, and Tool `isError` failures look alike | Separates protocol/connection errors, Tool execution errors, timeouts, and Schema validation failures |
| `content`, `structuredContent`, and `outputSchema` are hard to inspect together | Shows Markdown, images, audio, structured JSON, raw responses, and output Schema validation in one result view |
| A successful manual call is difficult to reproduce | Saves arguments as test cases with assertions and runs them as regression suites |
| Remote Streamable HTTP sessions expire | Follows MCP session rules, reinitializes after a Session 404, and safely retries once |
| Teams need durable, shared test environments | Imports and exports connections/cases, uses SQLite by default, and supports PostgreSQL |

## Use cases

- **MCP Server development** — verify Tool schemas, arguments, responses, and error semantics before release.
- **MCP Client and agent integration** — diagnose Streamable HTTP, SSE, Headers, timeouts, and session lifecycle issues.
- **QA and regression testing** — turn working requests into assertion-based cases and execute them in batches.
- **Shared team environments** — deploy a common MCP debugging workspace with Docker and PostgreSQL.
- **Schema compatibility testing** — validate JSON Schema 2020-12, `oneOf`, `anyOf`, `required`, and `outputSchema` behavior.

## Highlights

- Manage multiple MCP connections with custom Headers, timeouts, and live status.
- Connect through Streamable HTTP, SSE, or `auto` fallback mode.
- Synchronize, search, and inspect raw Tool schemas.
- Build arguments with RJSF 6 + Ajv 2020 forms or edit raw JSON directly.
- Distinguish protocol errors, Tool `isError`, timeouts, assertion failures, and output Schema failures.
- Inspect `content`, `structuredContent`, raw responses, start/end timestamps, and duration.
- Save, edit, enable, disable, and batch-run test cases.
- Assert content inclusion/exclusion, JSONPath values, duration, structured output, and Schema validity.
- Keep manual invocation and suite history for regression analysis.
- Choose SQLite or PostgreSQL persistence.
- Deploy with Docker Compose using `node:22-alpine`.
- Keep Authorization and other Header values out of normal connection API responses.

## Quick start

Requirements: **Node.js 20+**; **Node.js 22** is recommended.

```bash
git clone https://github.com/tushengtao/mcp-tool-debug.git
cd mcp-tool-debug
npm install
npm run dev
```

Open:

- Web UI: <http://localhost:5173>
- API health check: <http://localhost:8787/api/health>

You can also run each service separately:

```bash
npm run dev:server
npm run dev:web
```

## Docker deployment

The API image is built on `node:22-alpine`; Nginx serves the web application.

```bash
cp deployment/.env.example deployment/.env
cd deployment
chmod +x deploy.sh
./deploy.sh up
```

Management commands:

```bash
./deploy.sh status
./deploy.sh logs
./deploy.sh restart
./deploy.sh down
```

See [Docker deployment documentation](deployment/README.en.md) for details.

## PostgreSQL configuration

SQLite is enabled by default. For production or shared environments, update `deployment/.env`:

```dotenv
# Disable the default SQLite settings:
# DATABASE_URL=file:./data/mcp-debug.db
# DB_DIALECT=sqlite

# The PostgreSQL database must already exist and be reachable by the API container.
DATABASE_URL=postgresql://username:password@host.docker.internal:5432/mcp_debug
DB_DIALECT=postgres
```

Percent-encode special characters in usernames and passwords. For example, `p@ss#word` becomes `p%40ss%23word` inside `DATABASE_URL`.

## Typical workflow

1. Add a Streamable HTTP or SSE MCP endpoint on the Connections page.
2. Select Connect, then Sync Tools.
3. Open the workbench and choose a Tool.
4. Enter arguments through the generated form or raw JSON editor.
5. Invoke the Tool and inspect protocol status, timing, `content`, `structuredContent`, and Schema validation.
6. Save working arguments as test cases, add assertions, and run regression suites from Automation.

## Supported assertions

```json
{
  "expectIsError": false,
  "expectStructured": true,
  "structuredEquals": { "ok": true },
  "structuredSchemaValid": true,
  "contentTextContains": ["success"],
  "contentTextNotContains": ["error"],
  "maxDurationMs": 3000,
  "jsonPathEquals": [{ "path": "$.code", "value": 0 }]
}
```

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Backend API port | `8787` |
| `DATABASE_URL` | SQLite file or PostgreSQL URL | `file:./data/mcp-debug.db` |
| `DB_DIALECT` | `sqlite` / `postgres`; inferred from the URL when omitted | Inferred |
| `CORS_ORIGIN` | Web origin allowed to call the API | `http://localhost:5173` |

## Architecture

```mermaid
flowchart LR
    Browser["React Web Workbench"] --> API["Hono API"]
    API --> Client["MCP TypeScript Client"]
    Client --> MCP["MCP Server<br/>Streamable HTTP / SSE"]
    API --> DB[("SQLite / PostgreSQL")]
```

Built with React 18, Ant Design 5, RJSF 6, Ajv 8, CodeMirror, Hono, the MCP TypeScript SDK, Drizzle ORM, SQLite, PostgreSQL, and Docker Compose.

## Security notes

- Connection Headers may contain Authorization, cookies, or API keys. Normal connection APIs return Header names only, never values.
- Export bundles contain complete connection credentials. Store them only in trusted locations and never commit them to Git.
- Before exposing the application publicly, add HTTPS, authentication, access control, and rate limiting at the reverse proxy.
- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Never paste real tokens or private endpoints into a public issue.

## Roadmap

- [x] Streamable HTTP / SSE connections and Tool invocation
- [x] JSON Schema 2020-12 forms and output validation
- [x] Test cases, assertions, batch execution, and history
- [x] SQLite / PostgreSQL persistence and Docker deployment
- [ ] stdio transport
- [ ] Headless CLI runner for CI pipelines
- [ ] Fine-grained team access and credential management

Open an issue to discuss priorities, or contribute an implementation directly.

## Contributing

Bug reports, MCP Server compatibility cases, documentation improvements, and focused pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

Run these checks before submitting code:

```bash
npm run test:server
npm run build:server
npm run build:web
```

## License

Released under the [MIT License](LICENSE).

MCP Tool Debug is a community project and is not affiliated with the official Model Context Protocol project or Anthropic.
