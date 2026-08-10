---
summary: Defines the stable resource and metric fields accepted by Search.
read_when:
  - changing Search inputs, outputs, defaults, filters, sorting, metrics, or public resource names
---

# Search field catalog

BidBeacon exposes a deliberately small, stable field vocabulary. The catalog is shared by the MCP, CLI, and public operation layer; Amazon field names remain internal source mappings.

## Search implementation status

The shared Search operation implements `resource: campaign`, `resource: ad_group`, `resource: ad`, `resource: target`, `resource: product`, and `resource: change_event`. Each resource accepts its own fields, compatible ancestry where applicable, and the standard performance metrics where applicable. Omitting `fields` returns the selected resource's Default fields plus the standard metrics; supplying `fields` replaces that set. Descendant or unrelated fields are rejected with the compatible Field list in the validation details.

Every performance-bearing resource reads the canonical Target-grain daily archive (`entity_type = target`). Campaign, Ad-group, Ad, and Target group those observations by their stored topology identifiers. Product joins each observation's Ad to its advertised ASIN and groups by that ASIN across Ads and Campaigns. Rows are aggregated once at the selected resource grain, so topology joins never multiply metrics. Complete temporal reads and zero-filled points belong to [Performance](performance-api.md). Completed Target report metadata with zero records is complete while missing metadata remains unknown.

`product.title` and `ad.productTitle` are resolved in one bounded RankWrangler call for the final Search page. BidBeacon stores no product titles. Missing products or resolver failures return `null` without failing Search. These display-only fields cannot filter or order Search because enrichment occurs after pagination.

## Resource fields

| Resource | Default fields | Additional selectable fields |
| --- | --- | --- |
| `campaign` | `campaign.id`, `campaign.name`, `campaign.state`, `campaign.deliveryStatus`, `campaign.dailyBudget` | `campaign.targetingMode`, `campaign.bidStrategy`, `campaign.startDate`, `campaign.endDate` |
| `ad_group` | `adGroup.id`, `adGroup.name`, `adGroup.state`, `adGroup.deliveryStatus`, `adGroup.defaultBid`, `campaign.id`, `campaign.name` | None |
| `ad` | `ad.id`, `ad.state`, `ad.deliveryStatus`, `ad.asin`, `ad.productTitle`, `adGroup.id`, `adGroup.name`, `campaign.id`, `campaign.name` | `ad.type` |
| `target` | `target.id`, `target.state`, `target.deliveryStatus`, `target.type`, `target.scope`, `target.bid`, `target.negative`, `target.keyword`, `target.asin`, `target.matchType`, `campaign.id`, `campaign.name`, `adGroup.id`, `adGroup.name` | — |
| `product` | `product.asin`, `product.title` | None |
| `change_event` | `changeEvent.id`, `changeEvent.resourceType`, `changeEvent.resourceId`, `changeEvent.eventType`, `changeEvent.field`, `changeEvent.previousValue`, `changeEvent.newValue`, `changeEvent.changedAt`, `changeEvent.source` | None |

For `ad_group`, `ad`, and `target`, every field of the listed ancestor resources is also selectable. The table's Additional selectable fields column lists only fields belonging to the selected resource itself.

`product` is a read-only reporting resource. Its rows aggregate performance by advertised ASIN across ads. To retrieve the controllable topology, Search `ad` with `ad.asin` equal to `product.asin`; default Ad fields return the matching ad, ad-group, and campaign identities.

## Change-event values

- `changeEvent.resourceType`: `campaign`, `ad_group`, `ad`, or `target`
- `changeEvent.eventType`: `STATE_CHANGED`, `BID_CHANGED`, or `DAILY_BUDGET_CHANGED`
- `changeEvent.field`: `state`, `dailyBudget`, `defaultBid`, `bid`, `bidStrategy`, or `placementBidAdjustments`
- `changeEvent.changedAt`: ISO 8601 UTC timestamp
- `changeEvent.source`: `BIDBEACON`, `AMAZON_MARKETING_STREAM`, or `AMAZON_CHANGE_HISTORY`

`changeEvent.previousValue` and `changeEvent.newValue` use the public field's JSON type, including structured placement-adjustment objects. Equality filters compare structured values by JSON content rather than object key order. `changeEvent.source` is the actor/source vocabulary for this read contract. BidBeacon maps internal names such as `budgetAmount` and `bidAmount` before returning a Search row.

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
- `metrics.cvr`

Cost per order is not a v1 Field.

ACOS, CTR, and CVR are numeric percentage points. ROAS is a numeric multiplier. Spend, sales, and CPC use the Advertiser account's currency. Impressions, clicks, and orders are integer counts.

A ratio is `null` when its denominator is zero: ACOS without sales, CPC and CVR without clicks, CTR without impressions, and ROAS without spend. A zero numerator with a nonzero denominator remains numeric, so spend with zero sales has `metrics.roas: 0` and clicks with zero orders has `metrics.cvr: 0`. Null ratios sort after numeric values in either direction.

Every Metric Search response includes a `summary` with all ten standard metrics for the complete filtered result before pagination. Additive metrics are summed; ACOS, CPC, CTR, ROAS, and CVR are recomputed from the aggregate totals. Settings-only and Change-event searches omit the summary.

## Compatibility

- `campaign`: Campaign fields and metrics
- `ad_group`: Ad-group and Campaign ancestor fields plus metrics
- `ad`: Ad, Ad-group, and Campaign ancestor fields plus metrics
- `product`: Product fields and metrics
- `target`: Target fields, compatible Ad-group/Campaign ancestry, and metrics
- `change_event`: Change-event fields only; it has no performance fields, metrics, or coverage

Filters and ordering may use any compatible Field even when that Field is not selected for output.

## Default expansion

Omitting `fields` selects the resource's Default fields plus the ten Default performance metrics for every performance-bearing resource. `change_event` defaults to its resource fields without metrics. Its inclusive date range filters `entity_change_history.local_date` in the account's marketplace timezone and reports no performance coverage. Supplying `fields` replaces that expansion. Resource compatibility is validated by Search; validation errors identify the allowed fields for the selected resource.
