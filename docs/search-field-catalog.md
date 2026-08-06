---
summary: Defines the stable resource, metric, and segment fields accepted by Search.
read_when:
  - changing Search inputs, outputs, defaults, filters, sorting, metrics, segments, or public resource names
---

# Search field catalog

BidBeacon exposes a deliberately small, stable field vocabulary. The catalog is shared by the MCP, CLI, and public operation layer; Amazon field names remain internal source mappings.

## Campaign Search implementation status

The first shared Search slice implements `resource: campaign`. It accepts Campaign settings, the standard performance metrics, optional `metrics.cvr`, and the account-local `segments.date` field. Omitting `fields` returns the Campaign default fields plus the standard metrics; supplying `fields` replaces that set. The operation currently rejects fields owned by later Search slices, including other resources, `segments.hour`, and `segments.placement`.

Campaign performance reads the canonical daily archive at the advertised-ASIN grain (`performance_daily.entity_type = product`) and aggregates component metrics before deriving ACOS, CPC, CTR, ROAS, and CVR. Date-segmented rows are zero-filled for every Campaign and requested account-local date. Coverage comes from retained daily Product report metadata, so a completed report with zero records is complete while missing metadata remains unknown.

## Resource fields

| Resource | Default fields | Additional selectable fields |
| --- | --- | --- |
| `campaign` | `campaign.id`, `campaign.name`, `campaign.state`, `campaign.deliveryStatus`, `campaign.dailyBudget` | `campaign.targetingMode`, `campaign.bidStrategy`, `campaign.startDate`, `campaign.endDate` |
| `ad_group` | `adGroup.id`, `adGroup.name`, `adGroup.state`, `adGroup.deliveryStatus`, `adGroup.defaultBid`, `campaign.id`, `campaign.name` | None |
| `ad` | `ad.id`, `ad.state`, `ad.deliveryStatus`, `ad.asin`, `ad.productTitle`, `adGroup.id`, `adGroup.name`, `campaign.id`, `campaign.name` | `ad.type` |
| `target` | `target.id`, `target.state`, `target.deliveryStatus`, `target.type`, `target.bid`, `campaign.id`, `campaign.name`, `adGroup.id`, `adGroup.name` | `target.keyword`, `target.asin`, `target.matchType`, `target.negative` |
| `product` | `product.asin`, `product.title` | None |
| `change_event` | `changeEvent.id`, `changeEvent.resourceType`, `changeEvent.resourceId`, `changeEvent.eventType`, `changeEvent.field`, `changeEvent.previousValue`, `changeEvent.newValue`, `changeEvent.changedAt`, `changeEvent.source` | None |

For `ad_group`, `ad`, and `target`, every field of the listed ancestor resources is also selectable. The table's Additional selectable fields column lists only fields belonging to the selected resource itself.

`product` is a read-only reporting resource. Its rows aggregate performance by advertised ASIN across ads. To retrieve the controllable topology, Search `ad` with `ad.asin` equal to `product.asin`; default Ad fields return the matching ad, ad-group, and campaign identities.

## Change-event values

- `changeEvent.resourceType`: `campaign`, `ad_group`, `ad`, or `target`
- `changeEvent.eventType`: `STATE_CHANGED`, `BID_CHANGED`, or `DAILY_BUDGET_CHANGED`
- `changeEvent.field`: `state`, `dailyBudget`, `defaultBid`, or `bid`
- `changeEvent.changedAt`: ISO 8601 UTC timestamp
- `changeEvent.source`: `BIDBEACON`, `AMAZON_MARKETING_STREAM`, or `AMAZON_CHANGE_HISTORY`

`changeEvent.previousValue` and `changeEvent.newValue` use the public field's JSON type. BidBeacon maps internal names such as `budgetAmount` and `bidAmount` before returning a Search row.

## Performance fields

The following metrics are included by default in every performance-bearing resource Search:

- `metrics.impressions`
- `metrics.clicks`
- `metrics.spend`
- `metrics.orders`
- `metrics.sales`
- `metrics.acos`
- `metrics.cpc`
- `metrics.ctr`
- `metrics.roas`

`metrics.cvr` is selectable but not part of the default field set. Cost per order is not a v1 Field.

ACOS, CTR, and CVR are numeric percentage points. ROAS is a numeric multiplier. Spend, sales, and CPC use the Advertiser account's currency. Impressions, clicks, and orders are integer counts.

## Segments

- `segments.date`: account-local `YYYY-MM-DD`
- `segments.hour`: account-local hour from `0` through `23`
- `segments.placement`: `TOP_OF_SEARCH`, `REST_OF_SEARCH`, `PRODUCT_PAGE`, or `AMAZON_BUSINESS`

Selecting `segments.hour` also requires `segments.date`, preventing the same clock hour from being aggregated across multiple dates.

`segments.placement` is available only for Campaign Search and may be combined with `segments.date`, but not `segments.hour`. Placement is a Campaign-level reporting and control dimension; BidBeacon does not imply Product-, Ad-, Ad-group-, or Target-grain placement attribution.

## Compatibility

- `campaign`: Campaign fields, metrics, `segments.date`, `segments.hour`, and `segments.placement`
- `ad_group`: Ad-group and Campaign ancestor fields, metrics, `segments.date`, and `segments.hour`
- `ad`: Ad, Ad-group, and Campaign ancestor fields, metrics, `segments.date`, and `segments.hour`
- `target`: Target, Ad-group, and Campaign ancestor fields, metrics, `segments.date`, and `segments.hour`
- `product`: Product fields, metrics, `segments.date`, and `segments.hour`
- `change_event`: Change event fields only

Filters and ordering may use any compatible Field even when that Field is not selected for output.

## Default expansion

Omitting `fields` selects the resource's Default fields plus the nine Default performance metrics for every performance-bearing resource. `change_event` defaults to its resource fields without metrics. Supplying `fields` replaces that expansion. Resource compatibility is validated by Search; validation errors identify the allowed fields for the selected resource.
