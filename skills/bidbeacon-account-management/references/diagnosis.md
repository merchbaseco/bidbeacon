# Performance diagnosis

Use `search` as the sole advertising read. Keep the Account ID, resource, Fields, filters, ordering, and account-local date range consistent across a diagnosis so the result can be explained and compared.

## Campaign diagnosis

Search the `campaign` resource for the Campaign settings and the smallest useful set of standard metrics. Include `campaign.id` and `campaign.name` when reporting findings; add controls such as `campaign.state`, `campaign.deliveryStatus`, `campaign.dailyBudget`, `campaign.bidStrategy`, `campaign.targetingMode`, or placement controls only when they answer the question. Use `metrics.spend`, `metrics.sales`, `metrics.orders`, `metrics.acos`, `metrics.roas`, and supporting metrics as needed rather than treating every metric as equally meaningful.

Use `segments.date` when the question is about trend or day-level change. Use `segments.placement` only for Campaign Search when placement performance is the question. A segmented row is a different grain from an aggregate Campaign row; do not sum or compare unlike grains.

## Product diagnosis and ASIN traversal

1. Search the `product` resource with `product.asin` when the user names an ASIN. A Product is a read-only performance view aggregated across the account's matching Ads; it is not a controllable resource and does not contain child ID arrays.
2. Use the returned `product.asin` as the relationship key in a second `search` call on the `ad` resource with an `ad.asin` equality filter. Request the Ad settings and ancestor identity Fields needed to expose `ad.id`, `adGroup.id`, `adGroup.name`, `campaign.id`, and `campaign.name`.
3. Inspect those Ads, Ad groups, Campaigns, or Targets with additional `search` calls when the diagnosis needs delivery state, bids, targeting, or placement controls. Keep every call on the same explicit Account ID.

Never treat a Product row as an Ad, infer child IDs from a Product result, or join target-grain performance into Product performance. The Ad Search traversal is the canonical Product-to-Ad path.

## Comparison periods

Compare equal-length account-local periods with the same Search resource, Fields, filters, and grain. Run separate Searches for the current and comparison ranges; do not rely on a viewer's browser timezone or silently change the default seven-date range. State each resolved date range and whether it includes an open current date.

Compare rates with their denominators and absolute measures together: ACOS, CTR, and CVR are percentage points; ROAS is a multiplier; spend, sales, and CPC use the account currency; impressions, clicks, and orders are counts. A change in a rate without enough clicks, orders, or coverage is a lead, not a confident optimization instruction.

## Coverage-aware conclusions

For performance Searches, read `context.dateRange` and `context.coverage` before drawing conclusions. `COMPLETE` means every requested date has matching completed report evidence without parse errors. `INCOMPLETE` means at least one date is pending, failed, partially parsed, or otherwise problematic. `UNKNOWN` means no requested date has retained matching report evidence. Matching matters: ordinary daily, hourly, Target, and Campaign-placement Searches use their own coverage source. A valid completed zero-activity report is still complete; empty performance rows do not prove missing data.

Name affected dates and coverage issues in the conclusion. Settings-only Searches have no date range or coverage, and `change_event` Search has no performance coverage; do not claim either proves historical performance.
