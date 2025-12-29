# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Local Development
The server, database, and worker are always running in production at `bidbeacon.merchbase.co`. Local development only runs the dashboard, which proxies API requests to production.

```bash
yarn dev:dashboard      # Run dashboard dev server (port 4173, proxies /api to production)
```

## Database Queries (AI Only)

Claude can query the production database using a sub-agent pattern. See `docs/database-queries.md` for detailed instructions.

**When to use**: Verify API behavior, check data integrity, debug issues, answer questions about production data.

**How it works**: Sub-agent establishes SSH tunnel to production, runs SQL queries via psql, returns summary in isolated context.

### Building (Production Only)
```bash
yarn build              # Bundle server and worker
yarn build:dashboard    # Build dashboard for production
yarn preview:dashboard  # Preview built dashboard
```

### Database
```bash
yarn db:generate        # Generate migration files from schema changes
yarn db:migrate         # Apply migrations
yarn db:push            # Push schema changes directly (skip migration generation)
yarn db:studio          # Open Drizzle Studio UI
```

### Deployment
```bash
yarn deploy             # Deploy stack (runs ./scripts/deploy-stack.sh)
yarn logs               # View container logs
yarn status             # Check container status
yarn restart            # Restart containers
yarn stop               # Stop containers
```

### Utilities
```bash
yarn peek-dlq           # Inspect SQS dead letter queue messages
./test-api.sh           # Manual smoke tests (health + test endpoints)
```

## Architecture Overview

### Dual-Service Model
The codebase builds a single Docker image that runs as two separate containers in production:

- **API Server** (`src/index.ts` → `dist/index.js`): Fastify HTTP API with tRPC router, WebSocket events, and pg-boss background jobs
- **Worker** (`src/worker/index.ts` → `dist/worker.js`): SQS consumer that processes Amazon Marketing Stream messages

Both share the same PostgreSQL database. Vite builds both entry points into `dist/` via `vite.config.ts`.

**Development Workflow**: Server and worker always run in production at `bidbeacon.merchbase.co`. Local development only runs the dashboard dev server, which proxies `/api` requests to production.

### Key Subsystems

**Database** (`src/db/`)
- Drizzle ORM with PostgreSQL
- Schema in `schema.ts` (single file, ~35k lines)
- Migrations applied on server startup

**API** (`src/api/`)
- tRPC v11 router with 4 sub-routers: `accounts`, `metrics`, `reports`, `worker`
- WebSocket support for real-time events
- Context created per-request in `context.ts`

**Worker** (`src/worker/`)
- SQS long-polling consumer for Amazon Marketing Stream (AMS)
- Dataset handlers in `handlers/` validate and insert AMS data
- Router in `router.ts` dispatches by `datasetId` prefix
- No raw events table—only validated data enters DB

**Jobs** (`src/jobs/`)
- pg-boss backed by PostgreSQL
- Fluent builder pattern in `boss.ts`
- Jobs auto-register via import in `index.ts`
- Jobs process reports, sync ad entities, summarize streams, cleanup metrics

**Dashboard** (`src/dashboard/`)
- React 19 with React Router v7
- Base UI components (copy-paste, accessible by default)
- tRPC client connects to API via proxy in dev
- Separate Vite config (`vite.config.dashboard.ts`)

**Amazon Ads API** (`src/amazon-ads/`)
- Report creation, retrieval, and export
- Ads, campaigns, ad groups, targets entity sync
- Throttled fetch wrapper with rate limiting

**Libraries** (`src/lib/`)
- `create-report/`: Report creation logic
- `parse-report/`: Report parsing utilities
- `report-status-state-machine/`: Isolated state machine for report processing decisions

## Data Flow

### Amazon Marketing Stream (AMS) → Database
1. SNS publishes AMS messages to SQS
2. Worker polls queue, parses SNS envelope, validates data with Zod schemas
3. Handler maps fields and upserts to database (idempotent via unique indexes)
4. Invalid messages retry via SQS visibility timeout, eventually DLQ

### Background Jobs
Jobs run on the API server via pg-boss:
- `update-report-status`: Check report completion status
- `update-report-datasets`: Trigger report dataset updates for all accounts
- `sync-ad-entities`: Sync ads, campaigns, ad groups, targets from Amazon Ads API
- `summarize-*-stream`: Aggregate AMS data into `performance_hourly` and `performance_daily`
- `cleanup-ams-metrics`: Delete old AMS metrics

### Real-time Updates
- **Sync APIs**: Caller awaits response, invalidates React Query cache
- **Async Jobs**: Emit WebSocket events (`{table}:updated`) when background work completes
- **Chart Data**: Backend returns chart-ready arrays with zeros filled in; frontend displays directly

## Timezone Handling

### Storage Strategy
- **`ams_sp_*` tables**: Store `time_window_start` in UTC with timezone
- **`performance_hourly`**: Dual storage for flexibility
  - `bucket_start`: UTC timestamp (canonical, use for queries)
  - `bucket_date`/`bucket_hour`: Account's local timezone (human-readable grouping)
- **Account timezone**: Derived from `advertiser_account.country_code` via `getTimezoneForCountry()`

### Query Rules
- Display in browser timezone: Query by `bucket_start` (UTC range), group with `AT TIME ZONE` in SQL
- Display in account timezone: Query by `bucket_date`/`bucket_hour` directly
- **Never mix**: Don't use browser timezone to query `bucket_date` columns

### Common Issues
- Browser timezone ≠ account timezone (e.g., US account in PST viewed from EST)
- Timestamps stored timezone-less represent local time—compare in local timezone
- Job metadata varies by `job_name` in `job_metrics` table

## Code Formatting

Uses Biome for linting and formatting:
- 4-space indentation
- Single quotes, semicolons, ES5 trailing commas
- 200 character line width
- Arrow parentheses: `asNeeded`
- No explicit `any` warnings
- Unused variables/parameters allowed (but unused imports are errors)

Format: `biome format --write .`
Lint: `biome lint .`
