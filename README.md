# BidBeacon Server

Fastify-based API for BidBeacon's Amazon Ads integration.

## Hosting

Deployed on Mac Mini via self-hosted GitHub Actions runner.

- **URL:** https://bidbeacon.merchbase.co
- **DB Viewer:** http://localhost:4984 (pgweb, local only)
- **Local port:** 8091

## Deployment

Push to `main` triggers automatic build and deploy via self-hosted runner.

Manual deploy:
```bash
cd /Users/zknicker/srv/bidbeacon
git pull
docker compose build
docker compose up -d
```

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
- `./test-api.sh` – smoke test the health endpoint

## Docker Services

- `bidbeacon-postgres` – PostgreSQL 16 database
- `bidbeacon-server` – Node.js API server
- `bidbeacon-worker` – SQS consumer for Amazon Marketing Stream
- `bidbeacon-caddy` – Reverse proxy (port 8091)
- `bidbeacon-pgweb` – DB viewer (port 4984)

Health endpoint: `GET /api/health`
