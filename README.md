# BidBeacon Server

Fastify-based API for BidBeacon's Amazon Ads integration.

## Production

- **URL:** https://bidbeacon.merchbase.co
- **Health check:** `GET /api/health`
- **Remote MCP:** `POST https://bidbeacon.merchbase.co/mcp` (Clerk OAuth; see [`docs/mcp.md`](docs/mcp.md))

## Local Development

### Dev (no Docker)

```bash
bun install --frozen-lockfile
bun run dev
```

There is no `.env` step. `.env.schema` is the environment contract and values
resolve from 1Password through the desktop app — see
[docs/infrastructure.md](docs/infrastructure.md). Do not create a `.env` in the
checkout: varlock loads it above the schema and it will silently override
resolved values.

Run just the server if you don't want the dashboard:

```bash
bun run dev:server
```

`bun run dev` and `bun run dev:server` resolve
`BIDBEACON_DISABLE_SERVER_JOB_RUNNER=true` from the schema's development arm, so
local app-server sessions do not start PgBoss workers. Override for one run:

```bash
BIDBEACON_DISABLE_SERVER_JOB_RUNNER=false bun run dev:server
```

Run the worker in a second terminal if needed:

```bash
bun run worker
```

### Docker (server container)

```bash
bun run deploy:dry-run   # proves every op() reference resolves
```

The stack is deployed by the `Deploy Stack` workflow, not by a local
`docker compose up` — Compose alone has no values to interpolate now that the
schema owns them.

The API will be available at `http://localhost:8091/api/health`.

Postgres is bound to `127.0.0.1` for local-only access.

### Dashboard dev server

- Run `bun run dev:dashboard` to start the TanStack Start UI.
- Default port is `4173`; if it's taken, Vite will pick the next available port.
- `/api` requests are proxied to `BIDBEACON_DASHBOARD_API_PROXY_TARGET`, declared in `.env.schema`.

## Scripts

- `bun run build` – bundle server and worker
- `bun run skill:validate` – validate the optional Amazon Ads skill and its local references
- `bun run dev` – run API server + dashboard in dev mode
- `bun run dev:server` – run API server in dev mode with the server job runner disabled by default
- `bun run start` – run compiled server
- `bun run worker` – run worker in dev mode
- `bun run dev:dashboard` – run dashboard dev server (proxies /api to production)
- `./test-api.sh` – smoke test the health endpoint

## Optional Agent Skill

Install the optional `bidbeacon-amazon-ads` Agent Skill with [skills.sh](https://skills.sh/):

```bash
npx skills add merchbaseco/bidbeacon --skill bidbeacon-amazon-ads -g
```

The skill complements the self-sufficient MCP with progressively disclosed recipes for account reviews, Campaign and ASIN investigation, optimization, launch, negative targeting, lifecycle changes, and partial-failure recovery. Its source remains at `skills/bidbeacon-amazon-ads`; the MCP does not require it for correct tool calls.

## API Client (npm)

The typed client package lives in `packages/bidbeacon-api-client` and is published manually to npm.

Build the package:

```bash
bun run api-client:build
```

Publish (public scope):

```bash
cd packages/bidbeacon-api-client
# The suite publish token, resolved from the Tooling vault behind the release
# switch. (This block previously read RankWrangler's Keychain item.)
MERCHBASE_NPM_PUBLISH_TOKEN="$(BIDBEACON_RESOLVE_RELEASE_TOKENS=true bunx varlock printenv MERCHBASE_NPM_PUBLISH_TOKEN)" \
  npm publish --access public
```

Check current package version:

```bash
cat packages/bidbeacon-api-client/package.json | rg '\"version\"'
```

## Releases

Release policy and step-by-step instructions live in `docs/release-process.md`.

- One shared version (`vX.Y.Z`) is used across app, CLI, and `@bidbeacon/http-client`.
- Release updates are done manually with agent assistance (no required GitHub automation).

## Docker Services

- `postgres` – PostgreSQL 16 database
- `server` – Node.js API server
- `worker` – SQS consumer for Amazon Marketing Stream
- `caddy` – Reverse proxy (port 8091)
