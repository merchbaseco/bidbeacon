# Stream fixture

Stream fixture feeds one Sponsored Products traffic message through the same processor and router the worker uses, and the row lands in `ams_sp_traffic`.

## Sub-features

- `stream-ingest` accepts a fixture message for the seeded advertiser.
- `stream-row` reads that row back from Postgres.
- `stream-noop-delete` records the SQS delete call without contacting SQS.

## How to get to it (user POV)

- The production path is the SQS poller started with `bun run worker`. Do not start it here.
- The local path is `.cursor/skills/verify-bidbeacon/control-bidbeacon worker fixture`.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports the seed account `Cedar & Coil (dev seed)`.
- `BIDBEACON_DATABASE_HOST` is `127.0.0.1`. The control command sets that itself.

- **Ingest.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon worker fixture`. The command writes `worker/fixture.json`. `result.status` is `processed`, `row.clicks` is `7`, `row.impressions` is `42`, and `sqsDeleteCalls` is `1`.
- **Read back.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon worker show`. Stdout is JSON with `idempotencyId` `verify-bidbeacon-sp-traffic` and `clicks` `7`.
- **Proof.** Keep `worker/fixture.json`. Cleanup deletes the database row and leaves this file.

## Gotchas

- `bun run worker` long-polls the real Amazon Marketing Stream queue when AWS credentials work. That writes live rows into this database.
- The fixture's `deleteMessage` is a local function. `sqsDeleteCalls` counts that function. It does not count an SQS API call, because this command does not load the SQS client.
- Re-running upserts the same idempotency id. The click count stays `7`.
- If `result.status` is `skipped`, the file still exists and the command exits 1. The `reason` is the failure. Do not treat the seed's old `job_metrics` rows as a substitute.
