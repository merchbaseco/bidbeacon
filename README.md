# BidBeacon Server

Fastify-based API for BidBeacon's Amazon Ads integration.

## Production

- **URL:** https://bidbeacon.merchbase.co
- **Health check:** `GET /api/health`

## Local Development

```bash
yarn install
cp .env.example .env
# Fill in .env with your credentials
docker compose up --build
```

The API will be available at `http://localhost:8091/api/health`.

## Scripts

- `yarn build` – bundle server and worker
- `yarn start` – run compiled server
- `yarn worker` – run worker in dev mode
- `yarn dev:dashboard` – run dashboard dev server (proxies /api to production)
- `./test-api.sh` – smoke test the health endpoint

## Docker Services

- `postgres` – PostgreSQL 16 database
- `server` – Node.js API server
- `worker` – SQS consumer for Amazon Marketing Stream
- `caddy` – Reverse proxy (port 8091)
