# BidBeacon Server

Fastify-based API for BidBeacon's Amazon Ads integration.

## Production

- **URL:** https://bidbeacon.merchbase.co
- **Health check:** `GET /api/health`

## Local Development

### Dev (no Docker)

```bash
bun install
cp .env.example .env
# Fill in .env with your credentials
# Set BIDBEACON_DATABASE_HOST=localhost for local Postgres
bun run dev
```

Run just the server if you don't want the dashboard:

```bash
bun run dev:server
```

Run the worker in a second terminal if needed:

```bash
bun run worker
```

### Docker (server container)

```bash
docker compose up --build
```

The API will be available at `http://localhost:8091/api/health`.

Postgres is bound to `127.0.0.1` for local-only access.

### Dashboard dev server

- Run `bun run dev:dashboard` to start the TanStack Start UI.
- Default port is `4173`; if it's taken, Vite will pick the next available port.
- `/api` requests are proxied to production by default. Set `DASHBOARD_API_PROXY_TARGET` in `.env` to override (e.g. `http://localhost:8080`).

## Scripts

- `bun run build` – bundle server and worker
- `bun run dev` – run API server + dashboard in dev mode
- `bun run dev:server` – run API server in dev mode
- `bun run start` – run compiled server
- `bun run worker` – run worker in dev mode
- `bun run dev:dashboard` – run dashboard dev server (proxies /api to production)
- `./test-api.sh` – smoke test the health endpoint

## Docker Services

- `postgres` – PostgreSQL 16 database
- `server` – Node.js API server
- `worker` – SQS consumer for Amazon Marketing Stream
- `caddy` – Reverse proxy (port 8091)
