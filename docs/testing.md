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

The account acceptance harness builds a shared operation principal from the product access projection and verifies both Clerk-session and suite-API-key credential kinds. It lists only authorized marketplace-specific Advertiser Account UUIDs, returns the canonical metadata contract, ignores dashboard selection, and rejects Amazon account/profile identifiers or cross-account UUIDs. The access-migration test loads a legacy `ads_account_id` membership and verifies that the migration expands it to every matching `advertiser_account.id` without granting an unrelated account.

Campaign mutation acceptance lives at the same shared operation seam in
`src/operations/campaign-mutations.test.ts`. It uses the PGlite database and the programmable
Amazon gateway to assert public-to-Amazon mappings for every Campaign control, account-local date
conversion, placement omission versus zero removal, canonical responses, archive reconciliation,
immediate Change events, stable Amazon errors, and cross-account isolation. Campaign-specific
builders live in `src/operations/testing/campaign-mutation-fixtures.ts`; do not add Campaign
mutation data to the shared fixture module.

Auth tests must not use production credentials or database writes. Use the shared package's fake Clerk client/projection store patterns and assert that legacy `bbk_`, `BB_API_KEY`, query-string WebSocket credentials, and product-local API-key routes remain absent.
