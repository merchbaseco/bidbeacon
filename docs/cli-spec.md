---
summary: Defines BidBeacon's shared stateless MCP and CLI contract for advertising search, performance, and control.
read_when:
  - changing MCP tools, CLI commands, public advertising schemas, Search defaults, campaign writes, or agent guidance
---

# BidBeacon MCP and CLI specification

**Status:** Accepted design; account discovery and UUID authorization plus Campaign, Ad-group, and
Ad, Target, Product, and Change-event Search and Campaign, Ad-group, Ad, and Target mutation slices
are implemented in the shared operation layer, along with composite Sponsored Products campaign
creation. The public CLI, tRPC router, and typed HTTP client adapters are implemented from this shared layer.

This specification defines one public operation layer projected through:

- the BidBeacon MCP;
- the `bb` CLI;
- the typed HTTP client.

The surfaces share operation names, input schemas, outputs, defaults, and errors. Transport adapters contain no advertising business logic.

Sponsored Products is the only writable ad product in this version.

## Contract principles

- Every account-scoped call requires an explicit BidBeacon Advertiser account ID.
- The MCP and advertising operations are stateless. The CLI does not infer an account from dashboard state or local configuration.
- `search` is the sole read operation for advertising resources, performance, and change history.
- Public schemas use a small BidBeacon-owned vocabulary rather than Amazon report or API records.
- Ordinary campaign construction uses one synchronous composite operation. Primitive creation operations remain available for bespoke topology and recovery.
- Mutations use absolute desired values. There are no relative bid changes or dedicated pause, resume, and delete operations.
- All successful output is structured JSON. Tool execution errors are model-visible structured errors.

## Public operation inventory

| MCP tool | CLI command | Purpose |
| --- | --- | --- |
| `list_advertiser_accounts` | `bb advertiser-accounts list` | Discover accessible Account IDs and account metadata |
| `search` | `bb search <resource>` | Read current settings, performance, products, or change history |
| `create_sponsored_products_campaign` | `bb create sponsored-products-campaign` | Create one complete ordinary Sponsored Products campaign |
| `create_campaign` | `bb create campaign` | Create a campaign without children |
| `create_ad_group` | `bb create ad-group` | Add an ad group to an existing campaign |
| `create_ad` | `bb create ad` | Add an advertised ASIN to an ad group |
| `create_keyword_target` | `bb create keyword-target` | Add a positive keyword target |
| `create_product_target` | `bb create product-target` | Add a positive ASIN target |
| `create_negative_keyword` | `bb create negative-keyword` | Add an ad-group negative keyword |
| `create_negative_product_target` | `bb create negative-product-target` | Add an ad-group negative ASIN |
| `update_campaign` | `bb update campaign` | Patch campaign state and supported controls |
| `update_ad_group` | `bb update ad-group` | Patch ad-group state or default bid |
| `update_ad` | `bb update ad` | Patch ad state |
| `update_target` | `bb update target` | Patch target state or bid |

The tool set does not include aliases for the replaced list, get, metrics, history, tree, overview, pause, resume, archive, delete, set-budget, or set-bid commands.

## Shared conventions

### Identifiers

`accountId` is BidBeacon's opaque identifier for one marketplace-specific Advertiser account. Amazon account, profile, marketplace, campaign, ad-group, ad, and target identifiers are strings. Callers must not parse or numerically coerce them.

`list_advertiser_accounts` is the only operation that does not require `accountId`.

### Dates and timezones

Date inputs are inclusive account-local dates in `YYYY-MM-DD` format:

```json
{
  "startDate": "2026-07-01",
  "endDate": "2026-07-07"
}
```

The response identifies the account timezone and the resolved range. Hour segments are also account-local. See [timezones.md](timezones.md).

### Money, bids, and percentages

- Money and bids are JSON numbers in the Advertiser account's currency.
- `metrics.acos`, `metrics.ctr`, and `metrics.cvr` are percentage points: `24.45` means 24.45%.
- `metrics.roas` is a multiplier: `4.09` means 4.09x.
- Placement bid adjustments are percentage-point increases: `50` means a 50% increase.
- Outputs do not contain formatted currency or percentage strings.

### Resource state

Creation accepts:

```text
ENABLED | PAUSED
```

Updates accept:

```text
ENABLED | PAUSED | ARCHIVED
```

`ARCHIVED` is terminal and applies only to an existing resource. Amazon delivery diagnostics are exposed separately as `deliveryStatus`; callers do not write that field.

## Account discovery

### `list_advertiser_accounts`

Input:

```json
{}
```

Output:

```json
{
  "accounts": [
    {
      "id": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
      "name": "Zach US",
      "countryCode": "US",
      "marketplaceId": "ATVPDKIKX0DER",
      "timezone": "America/Los_Angeles",
      "currency": "USD",
      "amazonAdsAccountId": "A...",
      "profileId": "123..."
    }
  ]
}
```

The descriptive Amazon identifiers never substitute for `id` in another operation.

Discovery resolves the caller's shared-access principal to marketplace-specific Advertiser Account UUID memberships. It does not read `user_preferences` or infer an account from dashboard selection. Every account-scoped operation validates an explicit UUID and authorizes that UUID against the same principal; Amazon account IDs, profile IDs, and marketplace IDs are descriptive metadata only.

## Search

### Input

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "resource": "campaign",
  "fields": [
    "campaign.id",
    "campaign.name",
    "metrics.spend",
    "metrics.orders"
  ],
  "filters": [
    {
      "field": "campaign.state",
      "operator": "in",
      "value": ["ENABLED", "PAUSED"]
    },
    {
      "field": "metrics.spend",
      "operator": "gte",
      "value": 25
    }
  ],
  "dateRange": {
    "startDate": "2026-07-01",
    "endDate": "2026-07-07"
  },
  "orderBy": [
    {
      "field": "metrics.spend",
      "direction": "desc"
    }
  ],
  "limit": 20,
  "cursor": "opaque-server-cursor"
}
```

`resource` is one of:

```text
campaign | ad_group | ad | target | product | change_event
```

The resource determines row grain. A row may select fields from that resource and its ancestors, never its children. `product` is a read-only ASIN-grain view aggregated across matching ads.

The delivered Search slice supports `resource: campaign`, `resource: ad_group`, `resource: ad`, `resource: target`, `resource: product`, and `resource: change_event`. Each resource accepts its own fields, compatible ancestry where applicable, standard metrics where applicable, and the segments supported by its archive projection. Ad-group, Ad, and Product Search accept `segments.hour`, which requires `segments.date`. Campaign and Target Search accept `segments.date`; Change-event Search is settings/history-only and accepts no performance fields or segments.

### Filters

Each filter contains one Field, one operator, and one value. Supported operators are:

| Operator | Value | Meaning |
| --- | --- | --- |
| `eq` | scalar | Equal |
| `in` | non-empty scalar array | Equal to any supplied value |
| `contains` | string | Case-insensitive text containment |
| `gt` | number, date, or datetime | Greater than |
| `gte` | number, date, or datetime | Greater than or equal |
| `lt` | number, date, or datetime | Less than |
| `lte` | number, date, or datetime | Less than or equal |

Every filter must match. `in` expresses alternatives for one field; Search has no general-purpose `OR`, nested filter groups, or query-language string.

The Search schema constrains each field to its valid operators and value type. For example, IDs and states accept `eq` and `in`, names accept `eq`, `in`, and `contains`, and numeric metrics accept equality and comparison operators.

A compatible Field may be filtered or ordered without being selected for output.

### Fields and defaults

The complete field vocabulary lives in [search-field-catalog.md](search-field-catalog.md) and is embedded into the MCP input schema.

- Omitting `fields` selects the resource's documented Default fields.
- Supplying `fields` replaces the Default fields.
- Selecting a metric or segment makes the request a Performance search.
- Campaign Search accepts `segments.date`.
- Ad-group, Ad, and Product Search accept account-local `segments.hour`, which requires `segments.date`.
- A validation error names incompatible fields and the fields permitted for that resource.

Every performance-bearing Search resource reads the canonical Target-grain archive (`entity_type = target`). Campaign, Ad-group, Ad, and Target group those observations by their topology identifiers. Product joins each observation's Ad to its advertised ASIN and groups by that ASIN across Ads and Campaigns. Aggregate and date-segmented searches use the daily archive; hour-segmented Ad-group, Ad, and Product searches use the hourly archive. Rows are aggregated once at the selected resource grain, and segmented rows are account-local and zero-filled across the requested range. Coverage uses Target report metadata, including valid completed zero-record reports. Change-event Search reads account- and marketplace-scoped entity history and does not report performance coverage.

The Default fields for `campaign`, `ad_group`, `ad`, `target`, and `product` include the nine Standard performance metrics. A default campaign Search therefore behaves like the campaign table in the Amazon Ads dashboard: it returns campaign settings and recent performance together.

### Date defaults

- A Performance search without `dateRange` uses the last seven account-local dates, including the current date.
- A `change_event` Search without `dateRange` uses the same seven-date default.
- Change-event date ranges are inclusive account-local dates applied to the history row's `local_date`, not UTC timestamp truncation.
- A settings-only Search does not resolve or report a date range.
- The response always identifies an explicit or defaulted range and never silently substitutes a different range.

### Ordering

`orderBy` is an ordered array of Fields and `asc` or `desc` directions. When omitted:

- aggregate Performance searches order by `metrics.spend desc`;
- segmented Performance searches order by the selected segments ascending;
- settings-only Campaign and Ad-group searches order by name ascending;
- settings-only Ad and Target searches order by ID ascending;
- settings-only Product searches order by title and then ASIN ascending;
- `change_event` searches order by `changeEvent.changedAt desc`.

BidBeacon preserves requested ordering and ensures the selected segment Fields plus Campaign ID, Ad-group ID, Ad ID, Target ID, Product ASIN, or Change-event ID are present as deterministic continuation keys.

### Pagination

- `limit` defaults to `20`.
- `limit` accepts `1` through `200`.
- `cursor` is an opaque, query-bound keyset continuation token.
- A cursor is valid only with the account, resource, fields, filters, date range, and ordering that produced it.
- `nextCursor` is omitted after the final page.

Search has no offset or page-number input. The CLI's `--all` option follows server cursors and emits one JSON array after all pages succeed.

### Output

```json
{
  "context": {
    "account": {
      "id": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
      "timezone": "America/Los_Angeles",
      "currency": "USD"
    },
    "resource": "campaign",
    "fields": [
      "campaign.id",
      "campaign.name",
      "metrics.spend",
      "metrics.orders"
    ],
    "dateRange": {
      "startDate": "2026-07-01",
      "endDate": "2026-07-07",
      "source": "EXPLICIT"
    },
    "orderBy": [
      {
        "field": "metrics.spend",
        "direction": "desc"
      },
      {
        "field": "campaign.id",
        "direction": "asc"
      }
    ],
    "coverage": {
      "status": "COMPLETE",
      "issues": []
    }
  },
  "rows": [
    {
      "campaign.id": "123",
      "campaign.name": "Shirts - Auto",
      "metrics.spend": 42.31,
      "metrics.orders": 6
    }
  ],
  "nextCursor": "opaque-server-cursor"
}
```

Each row is a flat mapping whose keys exactly match the resolved `fields`.

`dateRange` and `coverage` are omitted for settings-only searches. `coverage` is omitted for `change_event`.

Coverage status is:

| Status | Meaning |
| --- | --- |
| `COMPLETE` | Every requested date has a completed daily report with zero parse errors |
| `INCOMPLETE` | At least one requested date has a pending, failed, partially parsed, or unknown issue |
| `UNKNOWN` | No requested date has retained report evidence |

Coverage issues are compact:

```json
{
  "date": "2026-07-03",
  "status": "UNKNOWN"
}
```

Issue status is `PENDING`, `FAILED`, `PARSE_ERRORS`, or `UNKNOWN`. `PARSE_ERRORS` also includes `errorCount`. Missing performance rows do not determine coverage; a valid zero-activity report is complete.

## Search field behavior

### Product-to-Ad traversal

Product rows intentionally omit relationship counts and child IDs:

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "resource": "product",
  "filters": [
    {
      "field": "product.asin",
      "operator": "eq",
      "value": "B0..."
    }
  ]
}
```

The agent uses the returned `product.asin` to retrieve controllable topology:

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "resource": "ad",
  "filters": [
    {
      "field": "ad.asin",
      "operator": "eq",
      "value": "B0..."
    }
  ]
}
```

Default Ad fields return each Ad ID plus its Ad group and Campaign identities.

### Aggregate and segmented performance

Metrics aggregate at the selected resource grain unless the caller selects a segment. Each selected segment becomes part of the row grain.

Examples:

- Campaign plus metrics: one row per campaign for the range.
- Campaign plus `segments.date`: one row per campaign and date.
- Product plus metrics: one row per advertised ASIN across all matching ads.

## CLI projection

The CLI serializes the same operation inputs and outputs as the MCP.

### Global behavior

- `--account <accountId>` is required by every account-scoped command.
- `--json <object>`, `--json @<path>`, and `--json -` accept the operation-specific JSON input from a literal, file, or stdin.
- Command flags and `--json` may not set the same input field.
- Successful stdout contains only the output JSON.
- A failure writes the structured error JSON to stderr and exits non-zero.
- Auth and base URL remain local runtime configuration. Advertiser account selection does not.

### Search syntax

```bash
bb search campaign \
  --account 6d997c64-3e64-4d50-b732-ec79d47f87f1 \
  --fields campaign.id,campaign.name,metrics.spend,metrics.orders \
  --where 'campaign.state in ["ENABLED","PAUSED"]' \
  --where 'metrics.spend>=25' \
  --start-date 2026-07-01 \
  --end-date 2026-07-07 \
  --order-by metrics.spend:desc \
  --limit 20
```

CLI `--where` syntax maps directly to structured filters:

```text
field=value
field contains "text"
field in ["value-1","value-2"]
field>value
field>=value
field<value
field<=value
```

Repeated `--where` flags are joined with `AND`. The CLI rejects ambiguous or unsupported expressions locally.

Other Search flags:

```text
--cursor <cursor>
--all
```

### Mutation syntax

Small mutations may use flags:

```bash
bb update target \
  --account 6d997c64-3e64-4d50-b732-ec79d47f87f1 \
  --target-id target_123 \
  --state PAUSED \
  --bid 0.45
```

Nested creation inputs use the canonical JSON schema:

```bash
bb create sponsored-products-campaign \
  --account 6d997c64-3e64-4d50-b732-ec79d47f87f1 \
  --json @campaign.json
```

The JSON document omits `accountId` when `--account` supplies it.

### Runtime commands

Local runtime commands are not advertising operations and therefore do not have MCP equivalents:

```text
bb auth set
bb auth set --stdin
bb auth status
bb auth clear
bb config show
bb config set base-url <url>
bb config unset base-url
bb changelog [version|--all]
```

On macOS, `auth set` stores the API key in Keychain using service `co.merchbase.cli` and account `api-key`. `MERCHBASE_API_KEY` overrides the secure-store value for automation. Auth commands never print the raw key. Configuration contains no selected Advertiser account.

## Typed client projection

The typed client exposes the operation names verbatim. Reads are queries and writes are mutations:

```ts
const accounts = await client.list_advertiser_accounts.query({});
const campaigns = await client.search.query({
  accountId,
  resource: "campaign",
});
const updated = await client.update_campaign.mutate({
  accountId,
  campaignId,
  changes: { dailyBudget: 25 },
});
```

Inputs and outputs are inferred from the shared operation router rather than copied into the client package.

## Canonical resource representations

Mutation results reuse these compact objects. Optional properties are omitted when they do not apply; nullable source values remain `null`.

### Campaign

```json
{
  "id": "campaign_123",
  "name": "Shirts - Auto",
  "state": "PAUSED",
  "deliveryStatus": "NOT_DELIVERING",
  "dailyBudget": 20,
  "bidStrategy": "DYNAMIC_DOWN_ONLY",
  "targetingMode": "AUTO",
  "startDate": "2026-08-05",
  "endDate": null,
  "placementBidAdjustments": {
    "topOfSearch": 50,
    "productPages": 20
  }
}
```

### Ad group

```json
{
  "id": "ad_group_123",
  "campaignId": "campaign_123",
  "name": "Default",
  "state": "ENABLED",
  "deliveryStatus": "DELIVERING",
  "defaultBid": 0.35
}
```

### Ad

```json
{
  "id": "ad_123",
  "campaignId": "campaign_123",
  "adGroupId": "ad_group_123",
  "state": "ENABLED",
  "deliveryStatus": "DELIVERING",
  "asin": "B0...",
  "productTitle": "Example shirt"
}
```

### Target

```json
{
  "id": "target_123",
  "campaignId": "campaign_123",
  "adGroupId": "ad_group_123",
  "state": "ENABLED",
  "deliveryStatus": "DELIVERING",
  "type": "KEYWORD",
  "negative": false,
  "matchType": "EXACT",
  "keyword": "funny cat shirt",
  "bid": 0.45
}
```

Target `type` is `KEYWORD`, `PRODUCT`, or `AUTO`. Keyword, ASIN, match type, and bid properties appear only when meaningful for that target.

## Composite campaign creation

### `create_sponsored_products_campaign`

This is the preferred operation for a normal campaign launch.

Input:

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "campaign": {
    "name": "Shirts - Exact",
    "state": "ENABLED",
    "dailyBudget": 20,
    "bidStrategy": "DYNAMIC_DOWN_ONLY",
    "startDate": "2026-08-05",
    "placementBidAdjustments": {
      "topOfSearch": 50
    }
  },
  "adGroup": {
    "name": "Default",
    "defaultBid": 0.35
  },
  "asins": ["B0ABC...", "B0DEF..."],
  "targeting": {
    "mode": "MANUAL_KEYWORD",
    "keywords": [
      {
        "keyword": "funny cat shirt",
        "matchType": "EXACT",
        "bid": 0.45
      }
    ]
  },
  "negatives": {
    "keywords": [
      {
        "keyword": "free",
        "matchType": "PHRASE"
      }
    ],
    "asins": ["B0NOPE..."]
  }
}
```

`campaign.state` is required. `campaign.startDate` defaults to the current account-local date. `campaign.endDate` is optional. `asins` and each target list are non-empty and contain no duplicates.

The request creates exactly one initial ad group with one targeting mode:

#### Automatic

```json
{
  "mode": "AUTO",
  "bidOverrides": {
    "closeMatch": 0.45,
    "looseMatch": 0.30,
    "substitutes": 0.25,
    "complements": 0.20
  }
}
```

Every override is optional. Omitted automatic groups inherit `adGroup.defaultBid`.

#### Manual keyword

```json
{
  "mode": "MANUAL_KEYWORD",
  "keywords": [
    {
      "keyword": "funny cat shirt",
      "matchType": "EXACT",
      "bid": 0.45
    }
  ]
}
```

Positive keyword match type is `BROAD`, `PHRASE`, or `EXACT`.

#### Manual product

```json
{
  "mode": "MANUAL_PRODUCT",
  "products": [
    {
      "asin": "B0COMPETITOR...",
      "bid": 0.40
    }
  ]
}
```

Only individual ASIN targets are public. Category, brand, price, rating, and expression refinements are not accepted.

Negative keywords use `PHRASE` or `EXACT`. Negative products are individual ASINs. All negatives created by this operation are ad-group scoped.

### Execution semantics

BidBeacon:

1. validates the complete request before any Amazon write;
2. creates the campaign in `PAUSED`;
3. creates the ad group, ads, positive targets, and negative targets in `ENABLED`;
4. applies the requested campaign state only after every child succeeds;
5. waits for Amazon responses, including normal throttling retries, before returning.

The campaign is the sole delivery gate. A requested `PAUSED` result still has enabled children so one later `update_campaign` call can launch the complete topology.

There is no background job, prepare token, confirmation token, agent-supplied idempotency key, or automatic rollback.

### Success output

```json
{
  "campaign": {},
  "adGroup": {},
  "ads": [],
  "targets": []
}
```

Each value uses the canonical representation above. `targets` includes positive and negative targets. The result contains no performance data and does not repeat full ancestry on every child.

### Partial failure

If an Amazon write fails after at least one resource succeeds, the operation returns a tool execution error:

```json
{
  "error": {
    "code": "COMPOSITE_PARTIAL_FAILURE",
    "message": "Sponsored Products campaign creation stopped during create_keyword_target. The Campaign remains paused.",
    "details": {
      "campaign": {},
      "created": {
        "adGroups": [],
        "ads": [],
        "targets": []
      },
      "failed": {
        "operation": "create_keyword_target",
        "input": {
          "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
          "adGroupId": "amazon-ad-group-id",
          "keyword": "free",
          "matchType": "EXACT",
          "bid": 0.45,
          "state": "ENABLED"
        },
        "amazon": {
          "code": "INVALID_ARGUMENT",
          "message": "..."
        }
      }
    }
  }
}
```

`campaign` and every entry in `created` use the canonical BidBeacon shapes. `failed.input` is the
exact primitive input that failed, and `failed.amazon` contains only useful sanitized Amazon error
fields; credentials and raw transport payloads are never returned. BidBeacon preserves successful
resources under the paused campaign, stops after the failed step, and does not attempt rollback.
The agent uses the disclosed IDs and primitive operations to repair the topology or archives it
through updates.

## Primitive creation

Primitive operations are escape hatches for extending existing campaigns, bespoke topology, and partial-failure recovery.

### `create_campaign`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "name": "Shirts - Auto",
  "state": "PAUSED",
  "dailyBudget": 20,
  "bidStrategy": "DYNAMIC_DOWN_ONLY",
  "targetingMode": "AUTO",
  "startDate": "2026-08-05",
  "endDate": null,
  "placementBidAdjustments": {
    "topOfSearch": 50
  }
}
```

Returns one canonical Campaign.

### `create_ad_group`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "campaignId": "campaign_123",
  "name": "Default",
  "state": "ENABLED",
  "defaultBid": 0.35
}
```

Returns one canonical Ad group.

### `create_ad`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "adGroupId": "ad_group_123",
  "asin": "B0...",
  "state": "ENABLED"
}
```

Returns one canonical Ad.

### `create_keyword_target`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "adGroupId": "ad_group_123",
  "keyword": "funny cat shirt",
  "matchType": "EXACT",
  "bid": 0.45,
  "state": "ENABLED"
}
```

Returns one canonical Target.

### `create_product_target`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "adGroupId": "ad_group_123",
  "asin": "B0COMPETITOR...",
  "bid": 0.40,
  "state": "ENABLED"
}
```

Returns one canonical Target.

### `create_negative_keyword`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "campaignId": "campaign_123",
  "adGroupId": "ad_group_123",
  "keyword": "free",
  "matchType": "PHRASE",
  "state": "ENABLED"
}
```

Returns one canonical Target with `negative: true`. Campaign-level negative creation is not public.

### `create_negative_product_target`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "campaignId": "campaign_123",
  "adGroupId": "ad_group_123",
  "asin": "B0NOPE...",
  "state": "ENABLED"
}
```

Returns one canonical Target with `negative: true`. Campaign-level negative creation is not public.

## Updates

Each update requires `accountId`, the resource ID, and a non-empty `changes` object. Omitted properties remain unchanged.
When `state` is `ARCHIVED`, it must be the only property in `changes`; BidBeacon routes that
absolute terminal state through Amazon's resource-specific archive endpoint.

### `update_campaign`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "campaignId": "campaign_123",
  "changes": {
    "state": "PAUSED",
    "dailyBudget": 25,
    "bidStrategy": "DYNAMIC_DOWN_ONLY",
    "placementBidAdjustments": {
      "topOfSearch": 30,
      "productPages": 0
    }
  }
}
```

Placement keys are `topOfSearch`, `restOfSearch`, `productPages`, and `amazonBusiness`. An omitted placement remains unchanged; `0` removes its adjustment. Returns the updated canonical Campaign.

### `update_ad_group`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "adGroupId": "ad_group_123",
  "changes": {
    "state": "ENABLED",
    "defaultBid": 0.40
  }
}
```

Returns the updated canonical Ad group.

### `update_ad`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "adId": "ad_123",
  "changes": {
    "state": "ARCHIVED"
  }
}
```

Returns the updated canonical Ad.

### `update_target`

```json
{
  "accountId": "6d997c64-3e64-4d50-b732-ec79d47f87f1",
  "targetId": "target_123",
  "changes": {
    "state": "PAUSED",
    "bid": 0.50
  }
}
```

`bid` is invalid for a negative target. Existing campaign-level or ad-group-level negatives may be archived by ID. Returns the updated canonical Target.

## Errors

All operation failures use:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Human- and model-readable explanation.",
    "details": {}
  }
}
```

Stable error codes:

| Code | Meaning |
| --- | --- |
| `AUTHENTICATION_REQUIRED` | Credentials are missing or invalid |
| `ACCOUNT_ACCESS_DENIED` | Credentials cannot access the explicit Account ID |
| `INVALID_INPUT` | The operation input fails schema or cross-field validation |
| `RESOURCE_NOT_FOUND` | The requested resource is not present in the explicit account |
| `CURSOR_INVALID` | The Search cursor is malformed, expired, or bound to another query |
| `AMAZON_REJECTED` | Amazon rejected the requested operation |
| `AMAZON_UNAVAILABLE` | Amazon remains unavailable after the documented retry policy |
| `COMPOSITE_PARTIAL_FAILURE` | Composite creation created some resources before a later failure |
| `INTERNAL_ERROR` | BidBeacon failed without a safe public diagnosis |

Errors do not silently retry a mutation as a new background operation. Useful Amazon error codes and messages appear in `details` without exposing credentials or raw transport payloads.

Performance coverage issues are successful Search results, not tool errors.

## MCP presentation

### Tool descriptions

Tool descriptions state:

- the capability and preferred use;
- that `accountId` is required and is a BidBeacon Account ID;
- material side effects;
- the returned resource or error behavior.

Descriptions do not repeat the field catalog, canonical resource shapes, or workflow manual. Shared schemas define those once in server code and generate each tool's JSON Schema.

### Tool annotations

| Tools | `readOnlyHint` | `destructiveHint` | `idempotentHint` | `openWorldHint` |
| --- | --- | --- | --- | --- |
| `list_advertiser_accounts`, `search` | `true` | `false` | `true` | `false` |
| Creation tools | `false` | `false` | `false` | `true` |
| Update tools | `false` | `true` | `true` | `true` |

Creation is additive but can begin spend when `state` is `ENABLED`. Tool annotations are hints, not an approval boundary. The tool title and description identify the financial side effect so the MCP host can apply its approval policy around the single call.

### Server instructions

MCP server instructions contain only universal invariants:

1. Discover the BidBeacon Account ID, then include it explicitly in every account-scoped call.
2. Search defaults to settings plus the last seven account-local dates of performance; request fields and dates explicitly when the task requires another shape.
3. Inspect current settings and relevant performance before consequential updates.
4. Prefer `create_sponsored_products_campaign` for ordinary launches and primitive creation only for bespoke topology or recovery.
5. Treat coverage issues as uncertainty in the archive, not zero performance.

Correct tool use does not depend on a client honoring these instructions.

## Optional Agent Skill

The MCP distribution also includes the independently installable `bidbeacon-amazon-ads` skill. Its recipe router covers:

- account discovery and explicit routing;
- account review and opportunity discovery;
- Campaign and ASIN investigation, including Product-to-Ad traversal;
- explicit comparison ranges, metric interpretation, and coverage-aware conclusions;
- inspect-before-mutate recommendations and approved updates;
- automatic, manual-keyword, and manual-ASIN campaign launch;
- negative targeting, pause/archive, and partial-failure recovery;
- selective MerchBase actual-sales and RankWrangler external-demand context;
- explicit user-requested skill extension.

Recipes contain only durable judgment, branching, and completion bounds. Exact inputs, defaults, Fields, and validation remain authoritative in the shared operation schemas. The skill is not required for MCP correctness.

## Migration from the pre-beta CLI

This contract cleanly replaces the prior public shape:

| Replaced behavior | Canonical behavior |
| --- | --- |
| Dashboard-selected or configured account fallback | Explicit `--account` on every account-scoped command |
| `campaigns list/get`, `metrics table/series`, `history`, `asins tree/overview` | `bb search <resource>` |
| Offset pagination | Opaque keyset cursor; `--all` follows cursors |
| Default `ENABLED` state filter | No implicit state filter |
| `purchases` | `orders` |
| `budget`, `budgetAmount` | `dailyBudget` |
| `pause`, `resume`, `delete`, `set-*`, relative bid adjustment | One absolute patch-style update per resource |
| Sequential ordinary campaign construction | `bb create sponsored-products-campaign` |

No compatibility aliases are part of the pre-beta migration.

## Reference rationale

The shape deliberately combines:

- [Google Ads MCP](https://github.com/googleads/google-ads-mcp)'s small `search`-centered read surface and separately installable diagnostic skills;
- [Amazon Ads MCP](https://advertising.amazon.com/en-ca/library/news/amazon-ads-mcp-server-open-beta)'s composite end-to-end Sponsored Products campaign workflow;
- BidBeacon's durable archive, explicit performance coverage, curated Field catalog, and ASIN-grain Product view.

Decision rationale is recorded in [ADR 0001](adr/0001-use-search-for-advertising-resource-reads.md) through [ADR 0011](adr/0011-layer-composite-campaign-creation-over-primitives.md).
