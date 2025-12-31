# BidBeacon Agent Context

## Architecture

Two services, same Docker image, separate containers:
- **API Server**: Fastify HTTP API + tRPC router
- **Worker**: SQS processor for Amazon Marketing Stream

Both share the same PostgreSQL database.

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

### Data Fetching

1. **Database-driven UI state** - Components derive state from database tables. Use `{table}:updated` events for invalidation.
2. **Sync APIs** - Caller awaits response, then invalidates React Query. No WebSocket events.
3. **Async Jobs** - Emit WebSocket events on completion for background changes the caller didn't initiate.

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
5. Run `yarn db:generate`

### Amazon Ads API

Wrap calls with `withTracking` and add `apiName` to `SUPPORTED_APIS` in api-metrics.

### DLQ Triage

Use `yarn peek-dlq` to inspect failures. Common fixes:
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
- Job metadata now lives in `job_sessions` and `job_events`. Filter by `job_name` and account details instead of scraping container logs.

---

## Debugging Tips

### Verifying Data Flow

1. **Check raw stream data**: Query `ams_sp_traffic` by `advertiser_id` (entity_id, not ads_account_id).
2. **Check aggregated data**: Query `performance_hourly` by `account_id` (ads_account_id).
3. **Map account → entity**: `advertiser_account` table links `ads_account_id` to `entity_id`.

### Job Inspection

- **Recent runs**: `SELECT * FROM job_sessions WHERE job_name = '...' ORDER BY started_at DESC LIMIT 5`
- **Timeline**: Join or filter `job_events` by `session_id` to see each stage/headline for that run.
- **Distinguish jobs**: `summarize-hourly-*` → `performance_hourly`, `summarize-daily-*` → `performance_daily`
- **Metadata differences**: Daily jobs include `bucketDate`, hourly jobs include `window: "trailing 24h"`.

### SSH Access

Ask the user for the SSH key path to access the production server at `merchbase.co`.
