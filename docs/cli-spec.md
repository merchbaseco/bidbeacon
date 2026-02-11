# BidBeacon CLI Spec

**Scope:** Sponsored Products use cases only for now.

This spec defines the public, user-facing shape of the Sponsored Products (SP) CLI. It describes how the CLI looks and behaves from a product perspective.

**Principles**
- Config-only state. No prompts or interactive flows.
- Resource-first, verb-second command shape.
- JSON-only output.
- One CLI command maps to one API capability.
- Flat command structure. Filters provide drill-down.

**Response Envelope**
```json
{"ok": true, "data": {}}
```
```json
{"ok": false, "error": {"code": "MISSING_CONFIG", "message": "config.account is required", "details": {}}}
```

**Config**
Config is stored locally at `~/.bidbeacon/config.json`.
- `bb config show`
- `bb config clear`
- `bb config set api-key <value>`
- `bb config set base-url <value>`
- `bb config set account <adsAccountId> <countryCode>`
- `bb config set range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>`

**Common Concepts**
- States: `ENABLED`, `PAUSED`, `ARCHIVED`, `OTHER`, `ALL`
- Metrics keys: `impressions`, `clicks`, `spend`, `purchases`, `sales`, `acos`, `cpc`, `ctr`, `roas`
- Pagination: `--limit <n>` and `--offset <n>` (list + metrics table)
- Sorting: `--sort <field>` and `--direction <asc|desc>`

**List Filters**
List commands accept `--state` or `--all`.
- Default is `ENABLED` when omitted.
- `--all` is shorthand for `--state ALL`.
- List commands return up to 20 items per request by default (override with `--limit`/`--offset`).

**Hierarchy Filters**
Drill down by passing parent IDs as flags.
- `bb ad-groups list --campaign <campaign_id>`
- `bb ads list --campaign <campaign_id>`
- `bb ads list --ad-group <ad_group_id>`
- `bb targets list --campaign <campaign_id>`
- `bb targets list --ad-group <ad_group_id>`

**Accounts**
- `bb accounts list`

**Campaigns**
- `bb campaigns list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--limit <n>] [--offset <n>]`
- `bb campaigns get <campaign_id>`
- `bb campaigns create <name> <budget>`
- `bb campaigns update <campaign_id> --name <name> [--portfolio <id>] [--start <iso>] [--end <iso>]`
- `bb campaigns pause <campaign_id>`
- `bb campaigns resume <campaign_id>`
- `bb campaigns delete <campaign_id>`
- `bb campaigns set-budget <campaign_id> <budget>`
- `bb campaigns set-bid-strategy <campaign_id> <strategy>`
- `bb campaigns set-bid-adjustments <campaign_id> <placement|audience|creative> <json>`

**Ad Groups**
- `bb ad-groups list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--campaign <campaign_id>] [--limit <n>] [--offset <n>]`
- `bb ad-groups get <ad_group_id>`
- `bb ad-groups create <campaign_id> <name> <default_bid>`
- `bb ad-groups update <ad_group_id> <name>`
- `bb ad-groups set-default-bid <ad_group_id> <value>`
- `bb ad-groups pause <ad_group_id>`
- `bb ad-groups resume <ad_group_id>`
- `bb ad-groups delete <ad_group_id>`

**Ads**
- `bb ads list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--asin <ASIN>] [--limit <n>] [--offset <n>]`
- `bb ads get <ad_id>`
- `bb ads create <ad_group_id> <asin|sku> [ASIN|SKU]`
- `bb ads update <ad_id> <state>`
- `bb ads delete <ad_id>`

**Targets**
- `bb targets list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--limit <n>] [--offset <n>]`
- `bb targets get <target_id>`
- `bb targets create keyword <ad_group_id> <keyword> <match_type> <bid>`
- `bb targets create product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU]`
- `bb targets set-bid <target_id> <value>`
- `bb targets adjust-bid <target_id> <delta>`
- `bb targets delete <target_id>`
- `bb targets pause <target_id>`
- `bb targets resume <target_id>`

**Bids**
Aliases that map to the same behavior as target bid updates.
- `bb bids set <target_id> <value>`
- `bb bids adjust <target_id> <delta>`

**Metrics**
Metrics commands come in two shapes.
- `series` returns a time-series for charting.
- `table` returns totals per entity.

Metrics common flags:
- `--metrics <key1,key2,...>` selects which metrics are returned. Defaults to all.
- `--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>` overrides the configured range.
- `--filter <key><op><value>` repeatable.
- `--search <text>` shortcut for `filters.search`.
- `--state <ENABLED|PAUSED|ARCHIVED|OTHER|ALL>` shortcut for `filters.state`.

Metrics series-only flags:
- `--bucket <auto|hour|day|week|month|year>`
- `auto` uses hourly for single-day ranges and daily otherwise.
- `hour` requires a single-day range.
- Weeks start Monday.

Metrics table-only flags:
- `--sort <field>`
- `--direction <asc|desc>`
- `--limit <n>`
- `--offset <n>`

Metrics table sort fields:
- `impressions`
- `clicks`
- `purchases`
- `spend`
- `sales`
- `acos`
- `cpc`
- `ctr`
- `roas`

Metrics filters:
- `search` or `name`
- `state` or `status` or `active-status`
- `targeting` (`AUTO` or `MANUAL`)
- `type` or `target-type` (`KEYWORD` or `PRODUCT`)
- `target-match-type` (`BROAD`, `PHRASE`, `EXACT`, `PRODUCT_EXACT`, `PRODUCT_SIMILAR`)
- `budget` (range)
- `end-date` (range)
- `out-of-budget` (`true|false`)
- `metrics.<key>` (range filter for any metrics key)

Filter operators:
- `=`, `!=`, `>=`, `<=`, `>`, `<`, `~` (fuzzy match)

Filter examples:
```bash
bb metrics table campaigns --filter state=ENABLED
bb metrics table campaigns --filter budget>=25 --filter budget<=100
bb metrics table campaigns --filter metrics.spend>=50
bb metrics series campaigns --filter search~holiday
```

Metrics series commands:
- `bb metrics series campaigns [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series ad-groups [--campaign <campaign_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series ads [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series targets [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`

Metrics table commands:
- `bb metrics table campaigns [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table ad-groups [--campaign <campaign_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table ads [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table targets [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`

**Enums**
- `bb enums bid-strategy`
- `bb enums match-type`
- `bb enums placement`
- `bb enums state`
