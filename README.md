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

Run the API in development mode with Docker:

```bash
docker compose up --build
```

This uses the local `docker-compose.yml`, which builds the server image from the current workspace and wires the exposed port `8080`.

To build and run the service manually:

```bash
yarn build
NODE_ENV=production yarn start
```

## Scripts

- `yarn build` – bundle the server with Vite
- `yarn start` – run the compiled server using `dotenv-cli` (expects `dist/index.js`)
- `yarn deploy` – helper script for the legacy standalone deployment (exits with guidance)
- `./scripts/commands.sh` – utilities for managing the production container over SSH (`logs`, `status`, `restart`, etc.)
- `./test-api.sh` – quick smoke tests for the health check endpoint

## Docker

- Dockerfile: `./Dockerfile`
- Compose files for local testing: `docker-compose.yml`
- Health endpoint: `GET /api/health`
- Test endpoint: `GET /api/test`

The default GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and pushes `ghcr.io/merchbaseco/bidbeacon-server` and triggers the infrastructure deployment in `merchbase-infra`.

## Testing

Manual smoke tests:

```bash
./test-api.sh
```

This script hits the health and test endpoints. Add new automated tests when extending the API surface.

