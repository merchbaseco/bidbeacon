# BidBeacon CLI Spec

**Scope:** Sponsored Products use cases only for now.

This spec defines the public, user-facing shape of the Sponsored Products (SP) CLI. It describes how the CLI looks and behaves from a product perspective.

**Principles**
- Config-only state. No prompts or interactive flows.
- Resource-first, verb-second command shape.
- JSON-only output.
- One CLI command maps to one user capability (some commands compose multiple API calls).
- Flat command structure. Filters provide drill-down.
- Release notes must be available from the installed CLI package so agents can inspect what changed without needing repo access.

**ASIN-Centric Command Model (Pre-Beta Direction)**
- ASIN workflows are first-class because optimization is frequently done per ASIN.
- The CLI must support one-hop ASIN check-ins without forcing users to manually chain multiple commands.
- Command responsibilities are explicit:
  - `bb asins tree <ASIN>` (topology): resolve connected entities (campaigns, ad groups, targets, ads) with minimal structural fields.
  - `bb asins overview <ASIN>` (operator check-in): ASIN performance summary derived from matched ad metrics, with optional hierarchical rollups.
  - `bb metrics ... --asin <ASIN>` (analysis workbench): full metrics querying (filters, sort, pagination, entity pivots, series/table).
- `--asin` in metrics commands performs internal ASIN->entity resolution so users keep one-hop ergonomics while command boundaries stay clean.
- Pre-beta policy applies: prefer clean command boundaries over compatibility shims.

**HTTP Path Shape (tRPC)**
- CLI command segments map to slash-style tRPC procedure paths.
- Pattern: `/api/<resource>/<verb>` (and deeper segments when needed).
- Examples:
  - `bb campaigns list` -> `GET /api/campaigns/list`
  - `bb campaigns create ...` -> `POST /api/campaigns/create`
  - `bb targets create keyword ...` -> `POST /api/targets/create/keyword`
  - `bb metrics series campaigns ...` -> `GET /api/metrics/series/campaigns`
- Transport URL note:
  - Slash-style procedure names are percent-encoded in the request path (for example `/api/campaigns%2Fget`).
- Transport remains tRPC semantics:
  - query procedures use `GET` with URL-encoded `input`
  - mutation procedures use `POST` with JSON body

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
- `bb config set base-url <value>` (`<value>` should be the server origin, for example `https://bidbeacon.merchbase.co`; a trailing `/api` is accepted and normalized)
- `bb config set account <adsAccountId> <countryCode>`
- `bb config set range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>`

**Common Concepts**
- States: `ENABLED`, `PAUSED`, `ARCHIVED`, `OTHER`, `ALL`
- Metrics keys: `impressions`, `clicks`, `spend`, `purchases`, `sales`, `acos`, `cpc`, `ctr`, `roas`
- Pagination: `--limit <n>` and `--offset <n>` (list + history + metrics table)
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
- `bb targets list --negative <true|false>`

**Accounts**
- `bb accounts list`

**Changelog**
- `bb changelog`
- `bb changelog <version>`
- `bb changelog --all`

Changelog behavior:
- Default output returns the current CLI version entry when available, otherwise the latest packaged entry.
- `<version>` accepts `1.2.3` or `v1.2.3`.
- `--all` returns every packaged changelog entry.

**Campaigns**
- `bb campaigns list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--limit <n>] [--offset <n>]`
- `bb campaigns search <query> [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--limit <n>] [--offset <n>]`
- `bb campaigns get <campaign_id>`
- `bb campaigns create <name> <budget>`
- `bb campaigns update <campaign_id> --name <name> [--portfolio <id>] [--start <iso>] [--end <iso>]`
- `bb campaigns pause <campaign_id>`
- `bb campaigns resume <campaign_id>`
- `bb campaigns delete <campaign_id>`
- `bb campaigns set-budget <campaign_id> <budget>`
- `bb campaigns set-bid-strategy <campaign_id> <strategy>`
- `bb campaigns set-bid-adjustments <campaign_id> <placement|audience|creative> <json>`

Campaign objects returned by campaign commands include:
- `campaignId`
- `name`
- `state`
- `budget`
- `bidStrategy`
- `startDateTime`
- `endDateTime`
- `portfolioId`
- `creationDateTime`
- `lastUpdatedDateTime`

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

Ad objects returned by ad commands include:
- `adId`
- `campaignId`
- `adGroupId`
- `state`
- `productIdType`
- `productId`
- `productTitle` (nullable)

**ASINs**
- Directional target model:
  - `bb asins tree <ASIN>`
  - `bb asins overview <ASIN> [--range <range>] [--depth <campaign|ad-group|ad>] [--metrics <key1,key2,...>] [--state <value>|--all]`

- Why this split exists:
  - `tree` answers "what is connected to this ASIN?"
  - `overview` answers "how is this ASIN performing right now?"
  - `metrics --asin` answers "which exact entities are driving the result and by how much?"

`bb asins tree <ASIN>` response shape:
- Top-level includes:
  - `asin`
  - `context`:
    - `accountId` / `countryCode`
    - `depth` (`campaign|ad-group|target|ad`)
    - `stateFilter` (`ENABLED` default, `ALL` when `--all`, other values when `--state` is passed)
    - `scope` counts (`campaigns`, `adGroups`, `ads`, `targets`)
  - `campaigns` (same structural hierarchy as before)
- Top-level `campaigns[]` items include:
  - `campaignId`
  - `campaignName`
  - `state`
  - `creationDateTime`
  - `targets` (hydrated target objects, not target IDs)
  - `adGroups` (hydrated ad group objects)
- Each `adGroups[]` item includes:
  - `adGroupId`
  - `campaignId`
  - `name`
  - `state`
  - `defaultBid`
  - `targets` (hydrated target objects, not target IDs)
  - `ads` (hydrated ad objects, not ad IDs)

`bb asins overview <ASIN>` response shape:
- Top-level includes:
  - `asin`
  - `context`:
    - `accountId` / `countryCode`
    - `range` / `rangeSource`
    - `timezone`
    - `depth` (`campaign` default, `ad-group`, or `ad`)
    - `stateFilter` (`ENABLED` default, `ALL` when `--all`, other values when `--state` is passed)
    - `metrics` (effective metrics keys)
    - `scope` counts (`campaigns`, `adGroups`, `ads`, `targets`)
  - `summary`:
    - `totals` (ASIN-level rollup for selected range, derived from matched ad metrics)
    - `campaigns[]` (campaign-level rollups; always present)
    - `campaigns[].adGroups[]` (when `--depth ad-group|ad`)
    - `campaigns[].adGroups[].ads[]` (when `--depth ad`)

Boundary guarantees:
- `asins tree` returns topology only (no performance metrics payload).
- `asins overview` returns curated ASIN-centric rollups only (not full workbench controls) and computes them from the matched ASIN ads, not whole-campaign totals.
- Deep analysis belongs to `metrics series/table --asin <ASIN>`.

**Targets**
- `bb targets list [--state ENABLED|PAUSED|ARCHIVED|OTHER|ALL] [--all] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--negative <true|false>] [--limit <n>] [--offset <n>]`
- `bb targets get <target_id>`
- `bb targets create keyword <ad_group_id> <keyword> <match_type> <bid>`
- `bb targets create product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU]`
- `bb targets set-bid <target_id> <value>`
- `bb targets adjust-bid <target_id> <delta>`
- `bb targets delete <target_id>`
- `bb targets pause <target_id>`
- `bb targets resume <target_id>`

Target detail commands return current entity state only.
Change history is fetched via explicit history commands.

**History**
- `bb history campaigns <campaign_id> [--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>] [--limit <n>] [--offset <n>]`
- `bb history ad-groups <ad_group_id> [--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>] [--limit <n>] [--offset <n>]`
- `bb history ads <ad_id> [--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>] [--limit <n>] [--offset <n>]`
- `bb history targets <target_id> [--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>] [--limit <n>] [--offset <n>]`

History range notes:
- `--range` overrides configured range.
- Aliases: `t`=`today`, `y`=`yesterday`, `w|week`=`7d`, `m|month`=`30d`.
- Range interpretation uses the selected account timezone.

History rows include:
- `id`
- `entityType` (`campaign`, `adGroup`, `ad`, `target`)
- `entityId`
- `eventType` (`bid_change`, `state_change`, `budget_change`)
- `fieldName`
- `previousValue`
- `newValue`
- `changedAt`
- `source` (`bidbeacon`, `ams`, `change_history`)

History response shape also includes:
- `context.entityType` / `context.entityId`
- `context.range` / `context.rangeSource`
- `context.timezone`
- `context.limit` / `context.offset` (`null` when omitted)

**Bids**
Aliases that map to the same behavior as target bid updates.
- `bb bids set <target_id> <value>`
- `bb bids adjust <target_id> <delta>`

**Metrics**
Metrics commands come in two shapes.
- `series` returns a time-series for charting.
- `table` returns totals per entity.

ASIN support:
- `bb metrics series <entity> --asin <ASIN> ...`
- `bb metrics table <entity> --asin <ASIN> ...`
- `--asin` is a first-class scope selector and can be combined with existing filters (`--campaign`, `--ad-group`, `--ids`, `--filter`, `--search`), with narrower filters taking precedence.

Metrics common flags:
- `--metrics <key1,key2,...>` selects which metrics are returned. Defaults to all.
- `--range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD>` overrides the configured range.
- `--group-by <campaigns|ad-groups|ads|targets>` alias for entity subcommands on both `series` and `table`.
- `--asin <ASIN>` scopes results to entities connected to the ASIN.
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
- `type` or `target-type` (`KEYWORD`, `PRODUCT`, or `AUTO`)
- `target-match-type` (`BROAD`, `PHRASE`, `EXACT`, `PRODUCT_EXACT`, `PRODUCT_SIMILAR`, `SEARCH_CLOSE_MATCH`, `SEARCH_LOOSE_MATCH`, `PRODUCT_SUBSTITUTES`, `PRODUCT_COMPLEMENTS`)
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
- `bb metrics series campaigns [--asin <ASIN>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series ad-groups [--asin <ASIN>] [--campaign <campaign_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series ads [--asin <ASIN>] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`
- `bb metrics series targets [--asin <ASIN>] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--bucket <auto|hour|day|week|month|year>]`

Metrics series responses include a `context` object with:
- `groupBy`, `ids`, `campaignId`, `adGroupId`, `asin`, `asinScope`, `asinStateFilter`
- `range`, `rangeSource`, `timezone`
- `bucket`, `metrics`, `filters`

Metrics table commands:
- `bb metrics table campaigns [--asin <ASIN>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table ad-groups [--asin <ASIN>] [--campaign <campaign_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table ads [--asin <ASIN>] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`
- `bb metrics table targets [--asin <ASIN>] [--campaign <campaign_id>] [--ad-group <ad_group_id>] [--ids <id1,id2,...>] [--range <range>] [--sort <field>] [--direction <asc|desc>] [--limit <n>] [--offset <n>]`

Metrics table responses include a `context` object with:
- `groupBy`, `ids`, `campaignId`, `adGroupId`, `asin`, `asinScope`, `asinStateFilter`
- `range`, `rangeSource`, `timezone`
- `metrics`, `filters`
- `sort`, `direction`, `limit`, `offset` (`null` when omitted)

**Enums**
- `bb enums bid-strategy`
- `bb enums match-type`
- `bb enums placement`
- `bb enums state`

**Implementation Plan (ASIN Command Boundaries)**
1. Introduce explicit command roles
- Add `bb asins overview` as the default one-hop ASIN check-in surface.
- Add `bb asins tree` as the structural resolver surface.
- Remove `bb asins get` in the same release to keep one canonical command per capability.

2. Add ASIN scoping to metrics workbench
- Add `--asin` to metrics series/table for all entities (`campaigns`, `ad-groups`, `ads`, `targets`).
- Resolve ASIN->entity IDs internally, then execute the existing metrics pipeline.
- Include `context.asin` and resolved scope counts in metrics responses for traceability.

3. Tighten payload boundaries
- `asins tree`: no metrics payloads.
- `asins overview`: curated/limited metrics payload intended for quick decisions.
- `metrics --asin`: full flexible payload for analysis and diagnosis.

4. Align docs/help/examples in same change set
- Update CLI help text and README examples to teach the three-command model.
- Add side-by-side examples for:
  - quick ASIN check-in (`asins overview`)
  - structural drill (`asins tree`)
  - deep diagnosis (`metrics table/series --asin`)

5. Ship a clean break
- Treat this as a pre-beta command-contract reset.
- Do not add aliases, deprecated paths, or compatibility wrappers for `asins get`.
