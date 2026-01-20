# BidBeacon Server

Fastify-based API for BidBeacon's Amazon Ads integration.

## Production

- **URL:** https://bidbeacon.merchbase.co
- **Health check:** `GET /api/health`

## Local Development

```bash
bun install
cp .env.example .env
# Fill in .env with your credentials
docker compose up --build
```

The API will be available at `http://localhost:8091/api/health`.

### Dashboard dev server

- Run `bun run dev:dashboard` to start the TanStack Start UI.
- Default port is `4173`; if it's taken, Vite will pick the next available port.
- `/api` requests are proxied to production by default (see `vite.config.dashboard.ts`).

## Scripts

- `bun run build` – bundle server and worker
- `bun run start` – run compiled server
- `bun run worker` – run worker in dev mode
- `bun run dev:dashboard` – run dashboard dev server (proxies /api to production)
- `./test-api.sh` – smoke test the health endpoint

## Docker Services

- `postgres` – PostgreSQL 16 database
- `server` – Node.js API server
- `worker` – SQS consumer for Amazon Marketing Stream
- `caddy` – Reverse proxy (port 8091)
