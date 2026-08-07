# BidBeacon Agent Context

> **Note:** `CLAUDE.md` is a symlink to this file.

## Working Style

- Address the user as **Zach**.
- Keep the tone kind of fun while staying focused on results.
- Commit messages must use `fix: ...` or `feat: ...` prefixes.
- Always squash all changes into a single commit.
- Rebase changes before publishing a PR.
- Timezone reference doc: `docs/timezones.md` (critical for Amazon Ads parity and future changes).
- Performance data reference doc: `docs/performance-data.md` (hourly vs daily reconciliation).
- Amazon Ads retry policy doc: `docs/amazon-ads-retry-policy.md`.
- Tests: run `bun run test` (Vitest). Avoid `bun test` (missing Vitest helpers).
- Proactively keep docs in sync with code changes: update the directly affected docs in the same PR, but avoid broad or speculative doc churn.
- Product phase policy: this is pre-beta, so prefer clean breaks over compatibility layers. Do not keep legacy/compat aliases unless explicitly requested.
- If `packages/bidbeacon-api-client/package.json` version changes, update `CHANGELOG.md` in the same PR.
- `CHANGELOG.md` release versions track BidBeacon app releases; API client package versions are independent and tracked in `packages/bidbeacon-api-client/package.json`.

## Agent skills

### Issue tracker

Specs and implementation issues are tracked in Linear under the Products team (`PRD`). BidBeacon work carries the `BidBeacon` label. See `docs/agents/issue-tracker.md`.

### Triage labels

The Products team uses the canonical five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

BidBeacon uses a single domain context at `CONTEXT.md`, with decisions under `docs/adr/`. See `docs/agents/domain.md`.

## Architecture

Two services, same Docker image, separate containers:
- **API Server**: Fastify HTTP API + tRPC router
- **Worker**: SQS processor for Amazon Marketing Stream

Both share the same PostgreSQL database.

### Authentication & Multi-Tenancy

Uses the shared `@merchbaseco/access` package for Clerk web sessions, suite API keys, and OAuth credentials. BidBeacon keeps a product-local Access Projection and resolves stable Merchbase Users to advertiser memberships:

```
Merchbase User (merchbase_user_id)
    └── user_account_access (M:N join table)
            └── Advertiser Account (advertiser_account_id; ads_account_id is a legacy bridge)
                    └── All data (campaigns, reports, metrics, etc.)
```

**Key files:**
- `src/services/access/bidbeacon-access.ts` - Fixed `bidbeacon` shared-access adapters and stable-user membership resolver
- `src/services/access/access-projection-store.ts` - Verified, idempotent, monotonic Clerk projection persistence
- `src/api/context.ts` - Normalizes shared credentials, exposes canonical Advertiser Account UUIDs, and retains legacy Amazon IDs for the old adapters
- `src/operations/advertiser-accounts.ts` - Canonical Advertiser Account UUID discovery and authorization
- `src/api/trpc.ts` - Legacy tRPC adapters use the Amazon-ID `assertAccountAccess(accountId)` bridge through PRD-185
- `src/db/schema.ts` - Stable-user memberships and Access Projection/event tables
- `src/api/access/clerk-webhook-route.ts` - Signed Clerk projection webhook

**Shared operation access-control pattern:**
```typescript
const account = await resolveAdvertiserAccount(context, { accountId: input.accountId });
```

`ctx.assertAccountAccess` and `Context.accessibleAccountIds` remain Amazon-ID compatibility APIs only; do not use them in shared operations. `accounts.sync` propagates a new marketplace-specific row to every stable user who owns the legacy Amazon account plus the authenticated user. `user_account_access.ads_account_id` remains only through the PRD-185 adapter cutover; shared operations authorize with the opaque Advertiser Account UUID and never consult dashboard selection.

### API Keys & CLI

Suite API keys are managed by Merchbase Account Center, use the shared `ak_...` convention, and are used by the `bb` CLI and API-key automation. BidBeacon has no product-local key issuer, verifier, route, table, or header.
- `src/services/access/bidbeacon-access.ts` - Shared session, OAuth, and API-key adapters for fixed service `bidbeacon`
- `packages/bidbeacon-cli/src/auth.ts` - `MERCHBASE_API_KEY` and shared Keychain convention
- `packages/bidbeacon-cli/src/index.ts` - CLI entrypoint for the globally installed `bb` binary (`@bidbeacon/cli`)

**Legacy CLI defaults:** The existing dashboard/API bridge still uses `api.users.getSelectedAccount` when no `--account` is provided. The shared operation layer has no selection fallback: `list_advertiser_accounts` is the only unscoped operation, and every other operation requires an explicit Advertiser Account UUID.

### Procedures & Routers

- `publicProcedure` - no auth
- `privateProcedure` - Clerk web session only
- `apiProcedure` - shared session, OAuth, or API-key auth

**Router split:**
- Clerk/private routers live in `src/api/app/*`
- Public shared-credential routers live in `src/api/public/*` and are mounted under `api.*`

---

## Code Style

### General

1. **No .js extensions in imports** - TypeScript/bundler handles resolution.
2. **Helper functions at bottom** - Main exports first, implementation details below.
3. **No index re-exports** - Import directly from files, never create barrel files.
4. **kebab-case for files** - Use `theme-toggle.tsx`, not `ThemeToggle.tsx`.
5. **Const arrow function syntax** - Define components and functions using `const` with arrow functions: `const EntityRow = (...) => { ... }`, not `function EntityRow(...) { ... }`.

### TypeScript

1. **Rely on type inference** - Let tRPC/Drizzle be the source of truth. Don't manually define types that can be inferred.
2. **Minimal exports** - Only export what's actually imported elsewhere. No preemptive exports.
3. **No underscore prefix for unused/private variables** - Don't use `_` prefix for unused or private variables. Remove unused variables or ignore linter warnings if needed.

### React Hooks

1. **One export per hook file** - Single hook export, returns an object with all data, state, and mutations.
2. **Required defined args** - Hooks should require defined (non-nullable) arguments. Components manage null/undefined state by checking values before calling hooks and returning early if needed. Use query `enabled` option to prevent execution when args aren't valid.
3. **Simple local state for immediate feedback** - Use `useState` for optimistic UI, not complex cache manipulation. Trust the server.
4. **Derive state inline** - Calculate derived values in the hook body, not separate functions.
5. **Memoize dates** - Always memoize `Date` objects used as query keys to prevent infinite refetch loops.
6. **Encapsulate data wiring** - If a component needs a query + related `useEffect` logic, extract it into a hook in `src/dashboard/routes/hooks/` and keep the component mostly presentational.

### Data Fetching

1. **Database-driven UI state** - Components derive state from database tables. Use `{table}:updated` events for invalidation.
2. **Sync APIs** - Caller awaits response, then invalidates React Query. No WebSocket events.
3. **Async Jobs** - Emit WebSocket events on completion for background changes the caller didn't initiate.

## Amazon Ads API Guidelines

- For Amazon Ads API calls, wait for the Amazon response (including throttling and retries) before responding. Follow `docs/amazon-ads-retry-policy.md`.

### Charts & Real-time Data

1. **Backend returns chart-ready data** - APIs should return complete arrays with zeros filled in, not sparse data. Frontend shouldn't generate intervals or match/merge data.
2. **Simple real-time updates** - WebSocket events update the current data point, not timestamp-matched positions. Periodic backend refresh syncs accuracy.

---

## Backend Design

### Worker

- **No raw events table** - Only validated data enters DB. Invalid messages retry via SQS.
- **Idempotency via unique indexes** - Retries are harmless.
- **Canonical shutdown** - Set flag, finish batch, exit. Visibility timeout handles in-flight.
- **SNS envelopes** - Parse `Type` field, only `Notification` contains AMS data.
- **Dataset routing** - Route by `datasetId` prefix.

### Adding Dataset Handler

1. Zod schema in `schemas.ts` (use `.passthrough()`)
2. Handler in `handlers/` (validate → map → upsert)
3. Route in `router.ts` by prefix
4. Unique index in `schema.ts`
5. Run `bun run db:generate`

### Amazon Ads API

Wrap calls with `withTracking` and add `apiName` to `SUPPORTED_APIS` in api-metrics.

### DLQ Triage

Use `bun run peek-dlq` to inspect failures. Common fixes:
- Make fields optional: `z.string().optional()`
- Accept multiple formats: `z.union([...])`
- Allow nulls: `.nullable().optional()`
- Use `.passthrough()` for unknown fields

---

## Report State Machine

Isolated in `src/lib/report-status-state-machine/`. Decision logic separate from execution.

**Flow:**
1. Report exists + COMPLETED → process
2. Report exists + NOT COMPLETED → none
3. No report + eligible → create
4. No report + not eligible → none

**Timezone handling** - Timestamps stored timezone-less but represent local time. Compare in local timezone.

**Eligibility** - Reports eligible at T-1, T-3, T-5, T-7, T-14, T-30, T-60 (daily) or T-24, T-72, T-312 hours (hourly) if not already created at that offset.

---

## Dashboard

TanStack Start app with file-based routing in `src/dashboard/routes/`.

### Key Points

- Route tree auto-generates - don't edit `routeTree.gen.ts`
- Router context provides `apiBaseUrl` from env vars
- Use `loader` for SSR data fetching
- Use `validateSearch` with Zod for type-safe search params

### Dev Server Notes

- `bun run dev` starts the API server + dashboard locally (no worker).
- Default port is `4173`; if the port is busy, Vite will choose the next open port.
- `/api` requests proxy to production by default via `vite.config.dashboard.ts`.

### Component Library

Use coss ui (Base UI + Tailwind). Copy-paste components, accessible by default.

---

## Timezone Architecture

### Storage Model

- **`ams_sp_*` tables** - Store `time_window_start` in UTC with timezone.
- **`performance_hourly`** - Dual storage:
  - `bucket_start`: UTC timestamp (canonical, use for queries)
  - `bucket_date`/`bucket_hour`: Account's local timezone (for human-readable grouping)
- **Account timezone** - Derived from `advertiser_account.country_code` via `getTimezoneForCountry()`.

### Query Patterns

- **Display in browser timezone**: Query by `bucket_start` (UTC range), group with `AT TIME ZONE` in SQL.
- **Display in account timezone**: Query by `bucket_date`/`bucket_hour` directly.
- **Never mix**: Don't use browser timezone to query `bucket_date` columns—they're stored in account timezone.

### Common Pitfalls

- Browser timezone ≠ account timezone. A US account (PST) viewed from EST shows different "today".
- Job metadata now lives in `job_metrics` and `events`. Filter by `job_name` and account details instead of scraping container logs.

---

## Debugging Tips

### Verifying Data Flow

1. **Check raw stream data**: Query `ams_sp_traffic` by `advertiser_id` (entity_id, not ads_account_id).
2. **Check aggregated data**: Query `performance_hourly` by `account_id` (ads_account_id).
3. **Map account → entity**: `advertiser_account` table links `ads_account_id` to `entity_id`.

### Job Inspection

- **Recent runs**: `SELECT * FROM job_metrics WHERE job_name = '...' ORDER BY started_at DESC LIMIT 5`
- **Timeline**: Join or filter `events` by `job_metric_id` to see each stage/message for that run.
- **Distinguish jobs**: `summarize-hourly-*` → `performance_hourly`, `summarize-daily-*` → `performance_daily`
- **Metadata differences**: Daily jobs include `bucketDate`, hourly jobs include `window: "trailing 24h"`.

### Database Queries

See `docs/database-queries.md` for patterns on querying the production database.

---

## Database Migrations

Uses **Drizzle ORM** with migration files in `drizzle/`.

### Development Workflow

1. **Modify schema** in `src/db/schema.ts`
2. **Generate migration**: `bun run db:generate`
3. **Review** the generated SQL in `drizzle/XXXX_*.sql`
4. **Rebuild and restart** the Docker services so the server applies migrations on startup

### Production Deployment

Migrations run automatically on server startup via `src/db/migrate.ts`. The server reads from `drizzle/` folder and tracks applied migrations in `__drizzle_migrations` table. There are no `db:migrate` or `db:push` scripts; always rebuild/restart the container after `bun run db:generate`.

**If you need to run SQL manually against production:**
```bash
docker exec bidbeacon-postgres psql -U bidbeacon -d bidbeacon -c "YOUR SQL HERE"
```

**Common operations:**
```bash
# List tables
docker exec bidbeacon-postgres psql -U bidbeacon -d bidbeacon -c "\dt"

# Describe table
docker exec bidbeacon-postgres psql -U bidbeacon -d bidbeacon -c "\d table_name"

# Run a query
docker exec bidbeacon-postgres psql -U bidbeacon -d bidbeacon -c "SELECT * FROM table LIMIT 5;"
```

### Migration Gotchas

1. **Foreign keys on non-unique columns fail** - The `advertiser_account.ads_account_id` is NOT unique (same account has multiple profiles/countries). Don't create FKs referencing it.

2. **Drizzle tracks migrations by hash in the `drizzle` schema** - The auto-migrator writes to `drizzle.__drizzle_migrations` and compares against migration file hashes, not tags. If you manually apply a migration, also insert the SHA256 hash into `drizzle.__drizzle_migrations`:
   ```sql
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('sha256_hash', epoch_ms);
   ```
   The `public.__drizzle_migrations` table may exist from older tools; it is not used by the runtime migrator.

3. **Never delete migration files** without also removing them from `drizzle/meta/_journal.json` and the corresponding snapshot file.

---

## Deployment

### Build & Deploy

```bash
# Full rebuild and deploy
docker compose up -d --build

# Rebuild specific service
docker compose build --no-cache server
docker compose up -d server worker

# Just restart (no rebuild)
docker compose up -d
```

### Service Names

Docker Compose services vs container names:
- `server` → `bidbeacon-server`
- `worker` → `bidbeacon-worker`
- `caddy` → `bidbeacon-caddy`
- `postgres` → `bidbeacon-postgres`

### Checking Health

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep bidbeacon

# Server logs
docker logs bidbeacon-server --tail 50

# Worker logs
docker logs bidbeacon-worker --tail 50
```

### Common Issues

1. **Server unhealthy after deploy** - Check logs for migration errors:
   ```bash
   docker logs bidbeacon-server 2>&1 | tail -30
   ```

2. **"relation already exists"** - Migration trying to create existing table. Either:
   - Drop the table and let migration recreate it
   - Mark migration as applied in `__drizzle_migrations`

3. **Cached Docker layers** - If code changes aren't reflected:
   ```bash
   docker compose build --no-cache server
   ```

---

## API Client Publishing (npm)

Typed client package: `packages/bidbeacon-api-client`.
Published npm package: `@bidbeacon/http-client`.

Spec doc: `docs/api-client-spec.md`.
Release runbook: `docs/release-process.md`.

Build:

```bash
bun run api-client:build
```

Publish (public):

```bash
cd packages/bidbeacon-api-client
# Load NPM_TOKEN from the repository .env
NPM_TOKEN="$(node --env-file=../../.env -p 'process.env.NPM_TOKEN')" npm whoami
NPM_TOKEN="$(node --env-file=../../.env -p 'process.env.NPM_TOKEN')" npm publish --access public --provenance=false
```

Update `packages/bidbeacon-api-client/package.json` version before each publish.

### Update Policy (CLI/Router Changes)

Any change to the public API surface (for example files under `src/api/public/`, `src/api/public/client.ts`, or schemas in `src/api/public/schemas.ts`) requires updating the API client package in **all** of these places:

1. Regenerate types and build the package:
   ```bash
   bun run api-client:build
   ```
   This updates `packages/bidbeacon-api-client/src/app-router.d.ts` and `packages/bidbeacon-api-client/dist/`.
2. Bump the version in `packages/bidbeacon-api-client/package.json`.
3. Publish the new version to npm:
   ```bash
   cd packages/bidbeacon-api-client
   npm publish --access public
   ```

Quick verify:
```bash
npm view @bidbeacon/http-client version
```

---

## Production Database Access

This machine has a configured `.pgpass` for the production database, so you can run read-only queries for debugging. Do **not** take any write actions (inserts/updates/deletes/migrations) without explicit user confirmation first.

**Test connection:**
```bash
psql -h zachs-mac-mini.taila0b849.ts.net -p 5432 -U bidbeacon -d bidbeacon -c "SELECT 1;"
```

See `docs/database-queries.md` for the full query workflow and examples.
