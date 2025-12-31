# Testing

We use Vitest for unit tests. Run with `yarn test`.

## What to test
- Report state machine eligibility and refresh scheduling.
- Timezone handling around `periodStart`, `lastReportCreatedAt`, and `nextRefreshAt`.

## Data expectations
Tests should mirror real production data shapes and timestamps (use sample rows from `report_dataset_metadata` when possible) so edge cases reflect reality, not synthetic assumptions.
