# Testing

We use Vitest for unit tests. Run with `bun run test`.

## What to test
- Report state machine eligibility and refresh scheduling.
- Timezone handling around `periodStart`, `lastReportCreatedAt`, and `nextRefreshAt`.
- Shared-access credential boundaries, stable-user M:N account resolution, projection webhook ordering, ticket single-use/expiry, and account-job access gates.
- AMS worker account resolution must cover direct `advertiser_id` identity plus required `marketplace_id`, canonical campaign/ad-group fallback, unknown/ambiguous mappings, and the pre-handler access boundary. Allowed messages route and delete only after handlers succeed; denied, unavailable, unknown, conflicting, and handler-failed messages remain queued.
- Deployment assertions must cover the five Clerk verifier variables on both server and AMS worker, the absence of the webhook signing secret on the worker, and the server job-runner maintenance flag's unset-safe default.

## Data expectations
Tests should mirror real production data shapes and timestamps (use sample rows from `report_dataset_metadata` when possible) so edge cases reflect reality, not synthetic assumptions.

## Public operation acceptance harness

The shared operation seam under `src/operations/` accepts an injected Drizzle database and Amazon Ads gateway. `createTestDatabase` creates a fresh in-memory PGlite instance, applies the production migrations for the operation-relevant tables, and exposes the PGlite-backed Drizzle connection. It creates no database files, ports, containers, or secondary repository. `createProductionOperationContext` keeps the production defaults on the existing PostgreSQL connection and Sponsored Products request functions.

Use the builders in `src/operations/testing/fixtures.ts` for advertiser access, ad entities, performance, report metadata, and change-history rows. `createFakeAmazonAdsGateway` records gateway calls, returns representative accepted responses, and can fail a selected operation call without duplicating Amazon validation. The PGlite migration loader omits only PostgreSQL deployment settings unavailable in PGlite (`pg_stat_statements` and the `performance_hourly` storage tuning); table definitions and operation queries still come from the repository’s production migrations and schema.

Auth tests must not use production credentials or database writes. Use the shared package's fake Clerk client/projection store patterns and assert that legacy `bbk_`, `BB_API_KEY`, query-string WebSocket credentials, and product-local API-key routes remain absent.
