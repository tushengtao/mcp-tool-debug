# Docker Deployment

[简体中文](README.md) | [English](README.en.md)

The API image uses `node:22-alpine`. Nginx serves the Web static files and proxies `/api/` requests to the API container.

## Start

```sh
cd deployment
chmod +x deploy.sh
./deploy.sh up
```

On the first run, the script creates `.env` from `.env.example`. The default endpoints are:

- Web: <http://localhost:5173>
- API health check: <http://localhost:8787/api/health>

When deploying with another hostname, scheme, or port, update `CORS_ORIGIN`, `WEB_PORT`, and `API_PORT` in `.env`.

## PostgreSQL

SQLite is enabled by default. To use an existing PostgreSQL database, replace the database settings in `.env`:

```dotenv
DATABASE_URL=postgresql://username:password@host.docker.internal:5432/mcp_debug
DB_DIALECT=postgres
```

The Compose file does not create PostgreSQL. The database must already exist and be reachable from the API container. Percent-encode special characters in usernames and passwords.

## Management commands

```sh
./deploy.sh status
./deploy.sh logs
./deploy.sh restart
./deploy.sh down
```

`down` does not delete SQLite data. It remains in the `mcp-tool-debug-data` Docker volume.
