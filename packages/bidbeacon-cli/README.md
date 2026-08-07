# @bidbeacon/cli

BidBeacon’s canonical operation CLI.

## Install

```bash
npm install -g @bidbeacon/cli
```

## Contract

```bash
bb auth set --stdin
bb advertiser-accounts list
bb search campaign --account <advertiser-account-uuid> --fields campaign.id,metrics.orders --where 'metrics.orders>=1' --all
bb create campaign --account <advertiser-account-uuid> --name "Example" --state ENABLED --daily-budget 25 --bid-strategy FIXED --targeting-mode AUTO --start-date 2026-08-06
bb create sponsored-products-campaign --account <advertiser-account-uuid> --json @campaign.json
bb update target --account <advertiser-account-uuid> --target-id <target-id> --bid 0.75
bb config show
bb changelog
```

All account-scoped commands require an explicit advertiser account UUID. The CLI does not read or write a selected account. `bb advertiser-accounts list` is the only unscoped operation.

Search supports explicit fields, account-local inclusive dates, stable ordering, keyset cursors, repeated `--where` AND filters, and `--all`. Use `in ["a", "b"]` for alternatives. Metric fields use the canonical vocabulary, including `metrics.orders` and `metrics.cvr`.

Primitive create and update operations accept camel-case operation properties as kebab-case flags. Nested input can come from a JSON literal, `@file`, or stdin:

```bash
bb update campaign --account <advertiser-account-uuid> --campaign-id <campaign-id> --json '{"changes":{"state":"PAUSED"}}'
bb create sponsored-products-campaign --account <advertiser-account-uuid> --json - < campaign.json
```

Flags and JSON may not assign the same property twice. Successful operation output is JSON on stdout. Failures are stable `{ "error": { "code", "message", "details" } }` JSON on stderr with a nonzero exit status.

## Local configuration

Authentication uses the platform secure store. `MERCHBASE_API_KEY` is intended for automation, CI, and agent runtimes; it is never persisted by the CLI.

`bb config set storage-dir <path>` persists a custom transport-settings directory. The only saved settings are `base-url` and the storage directory itself. Environment overrides take precedence:

- `MERCHBASE_API_KEY`
- `BB_STORAGE_DIR`
- `BB_BASE_URL`

There is no account, country, range, or dashboard-selection configuration.
