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

Use the builders in `src/operations/testing/fixtures.ts` for shared advertiser access, ad entities, performance, report metadata, and change-history rows. Search acceptance uses resource-specific builders in `src/operations/testing/search-fixtures.ts`, `src/operations/testing/search-ad-resources-fixtures.ts`, and `src/operations/testing/search-product-fixtures.ts`; Product acceptance lives in `src/operations/search-product.test.ts`, while Campaign mutation data remains isolated in its own fixture module. `createFakeAmazonAdsGateway` records gateway calls, returns representative accepted responses, and can fail a selected operation call without duplicating Amazon validation. The PGlite migration loader omits only PostgreSQL deployment settings unavailable in PGlite (`pg_stat_statements` and the `performance_hourly` storage tuning); table definitions and operation queries still come from the repository’s production migrations and schema.

The account acceptance harness builds a shared operation principal from the product access projection and verifies both Clerk-session and suite-API-key credential kinds. It lists only authorized marketplace-specific Advertiser Account UUIDs, returns the canonical metadata contract, ignores dashboard selection, and rejects Amazon account/profile identifiers or cross-account UUIDs. The access-migration test loads a legacy `ads_account_id` membership and verifies that the migration expands it to every matching `advertiser_account.id` without granting an unrelated account.

Campaign mutation acceptance lives at the same shared operation seam in
`src/operations/campaign-mutations.test.ts`. It uses the PGlite database and the programmable
Amazon gateway to assert public-to-Amazon mappings for every Campaign control, account-local date
conversion, placement omission versus zero removal, canonical responses, archive reconciliation,
immediate Change events, stable Amazon errors, and cross-account isolation. Campaign-specific
builders live in `src/operations/testing/campaign-mutation-fixtures.ts`; do not add Campaign
mutation data to the shared fixture module.

Ad-group and Ad mutation acceptance lives at the same seam in
`src/operations/ad-mutations.test.ts`. It asserts all four primitive operations, exact gateway
payloads, ASIN and state validation, terminal archive enforcement, Sponsored Products and
account-owned Campaign/Ad-group ancestry before Amazon, canonical response mappings, archive
reconciliation, immediate Change events, stable Amazon errors, and cross-account isolation.
Ad-mutation builders live in
`src/operations/testing/ad-mutation-fixtures.ts`; keep them separate from Campaign fixtures and
do not use an alternate repository or local Postgres service.

Campaign placement Search acceptance lives in `src/operations/placement-search.test.ts` and uses
the production `performance_daily_placement` schema through the embedded PGlite harness. Its
placement-specific builders live in `src/operations/testing/placement-search-fixtures.ts`. Keep
placement coverage assertions tied to `entityType = placement`; ordinary ASIN/Target report
metadata is not valid placement coverage evidence. The ingestion acceptance test uses the same
production projection and verifies source normalization, normalized-key aggregation, unknown-value
accounting, authoritative stale-row reconciliation, marketplace-scoped metadata, idempotence,
account-local dates, and changed-row counts.

Target Search acceptance lives in `src/operations/search-target.test.ts` with builders in
`src/operations/testing/search-target-fixtures.ts`. It uses production target settings,
target-grain daily performance, and target report metadata through embedded PGlite; coverage
must not use advertised-ASIN rows. Change-event Search acceptance lives in
`src/operations/search-change-events.test.ts` with builders in
`src/operations/testing/search-change-event-fixtures.ts`; it verifies inclusive account-local
history dates, public event mappings, JSON values, deterministic cursors, and the absence of
performance coverage.

Target mutation acceptance lives at the same seam in `src/operations/target-mutations.test.ts`.
It asserts positive keyword/product and ad-group negative keyword/product creation, broad/phrase/
exact keyword match types, individual-ASIN-only product targeting, explicit Campaign/Ad-group
ancestry, exact gateway payloads, canonical response mappings, positive bid eligibility, terminal
archive enforcement, campaign-level-negative archival by ID, archive reconciliation, immediate
Change events, stable Amazon errors, and cross-account isolation. Target-mutation builders live
in `src/operations/testing/target-mutation-fixtures.ts`; keep them target-specific and use the
production operation path with embedded PGlite and the programmable gateway.

Composite Sponsored Products creation acceptance lives in
`src/operations/composite-campaign-mutations.test.ts`. It uses the same embedded PGlite and
programmable gateway to cover complete validation, automatic/manual keyword/manual product
topologies, default-bid inheritance, placement controls, negative Targets, child-enabled versus
Campaign-gated state, canonical success output, and every partial-failure position. Its Amazon
responses live in `src/operations/testing/composite-campaign-fixtures.ts`; the gateway supports
response sequences so each synchronous child has an independent accepted resource.

Auth tests must not use production credentials or database writes. Use the shared package's fake Clerk client/projection store patterns and assert that legacy `bbk_`, `BB_API_KEY`, query-string WebSocket credentials, and product-local API-key routes remain absent.
