---
summary: Defines the stable resource, metric, and segment fields accepted by Search.
read_when:
  - changing Search inputs, outputs, defaults, filters, sorting, metrics, segments, or public resource names
---

# Search field catalog

BidBeacon exposes a deliberately small, stable field vocabulary. The catalog is shared by the MCP, CLI, and public operation layer; Amazon field names remain internal source mappings.

## Search implementation status

The shared Search operation implements `resource: campaign`, `resource: ad_group`, and `resource: ad`. Each resource accepts its own fields, compatible Campaign ancestry, the standard performance metrics, and the account-local segments documented below. Omitting `fields` returns the selected resource's Default fields plus the standard metrics; supplying `fields` replaces that set. Descendant fields are rejected with the compatible Field list in the validation details.

Campaign, Ad-group, and Ad aggregate component metrics from the canonical advertised-ASIN archive (`entity_type = product`) before deriving ACOS, CPC, CTR, ROAS, and CVR. Aggregate and date-segmented searches use `performance_daily`; hour-segmented searches for Ad groups and Ads use `performance_hourly`. Rows are aggregated at the selected resource grain, so multiple advertised-ASIN archive rows never multiply a resource's metrics. Date- and hour-segmented rows are account-local and zero-filled for each selected resource across the requested range. Coverage comes from retained daily Product report metadata, so a completed report with zero records is complete while missing metadata remains unknown.

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
- `segments.hour`: account-local hour from `0` through `23`; available for Ad-group and Ad Search and requires `segments.date`
- `segments.placement`: `TOP_OF_SEARCH`, `REST_OF_SEARCH`, `PRODUCT_PAGE`, or `AMAZON_BUSINESS`

Selecting `segments.hour` also requires `segments.date`, preventing the same clock hour from being aggregated across multiple dates.

`segments.placement` is not part of this Search slice. Placement is a Campaign-level reporting and control dimension; BidBeacon does not imply Product-, Ad-, Ad-group-, or Target-grain placement attribution.

## Compatibility

- `campaign`: Campaign fields, metrics, and `segments.date`
- `ad_group`: Ad-group and Campaign ancestor fields, metrics, `segments.date`, and `segments.hour`
- `ad`: Ad, Ad-group, and Campaign ancestor fields, metrics, `segments.date`, and `segments.hour`
- `target`, `product`, and `change_event`: cataloged but not implemented in this Search slice

Filters and ordering may use any compatible Field even when that Field is not selected for output.

## Default expansion

Omitting `fields` selects the resource's Default fields plus the nine Default performance metrics for every performance-bearing resource. `change_event` defaults to its resource fields without metrics. Supplying `fields` replaces that expansion. Resource compatibility is validated by Search; validation errors identify the allowed fields for the selected resource.
