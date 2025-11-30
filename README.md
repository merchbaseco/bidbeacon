# BidBeacon Server

Fastify-based API for BidBeacon. The service is distributed as a Docker container via GitHub Container Registry (GHCR) and fronts the `/api/*` routes behind the public Caddy proxy.

## Requirements

- Node.js 18+
- Yarn 4 (Corepack enabled)
- Docker (optional, for container builds)

## Setup

```bash
yarn install
cp .env.example .env
# fill .env with any required configuration
```

## Local Development

```bash
docker compose up --build
```

Runs both API server (port 8080) and worker. Worker needs `AMS_QUEUE_URL` and AWS credentials in `.env`.

To build and run the service manually:

```bash
yarn build
NODE_ENV=production yarn start
```

## Scripts

- `yarn build` – bundle server and worker
- `yarn start` – run compiled server
- `yarn worker` – run worker in dev mode (`tsx`)
- `yarn start:worker` – run compiled worker

## Docker

- Dockerfile: `./Dockerfile`
- Compose files for local testing: `docker-compose.yml`
- Health endpoint: `GET /api/health`
- Test endpoint: `GET /api/test`

GitHub Actions builds and deploys via `merchbase-infra`. Two services: API server and SQS worker. See [AGENTS.md](./AGENTS.md) for context.

## Testing

Manual smoke tests:

```bash
./test-api.sh
```

This script hits the health and test endpoints. Add new automated tests when extending the API surface.

