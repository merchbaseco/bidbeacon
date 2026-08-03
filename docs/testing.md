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

Auth tests must not use production credentials or database writes. Use the shared package's fake Clerk client/projection store patterns and assert that legacy `bbk_`, `BB_API_KEY`, query-string WebSocket credentials, and product-local API-key routes remain absent.
