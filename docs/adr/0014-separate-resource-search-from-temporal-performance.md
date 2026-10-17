---
summary: Records why Search owns resource snapshots while Performance owns complete temporal reads.
read_when:
  - adding or changing a public advertising read operation
  - changing Search metrics, temporal buckets, or Performance limits
---

# Separate resource Search from temporal Performance

BidBeacon exposes two complementary public read operations. Search returns independently useful, cursor-paginated resource snapshots whose metrics are aggregated over an account-local date range; its summary covers the complete filtered resource result, but its rows never segment by date or hour. Performance returns one complete, bounded temporal result for an Account or an explicit small set of Products, Ads, Targets, or Campaigns, with selected metrics, totals, zero-filled points, impression activity, timezone, and honest archive coverage. A successful Performance call has no cursor: it returns the complete requested series or a structured size or execution error.

This supersedes [ADR 0001](0001-use-search-for-advertising-resource-reads.md). Keeping temporal segments in Search made a complete chart depend on exhaustive cursor traversal, so valid high-cardinality queries produced long-running client orchestration and unclear completeness. A family of table, chart, overview, and entity-specific endpoints was also rejected. Search and Performance instead have distinct deep contracts: resource discovery and ranking versus bounded temporal measurement. Performance deliberately does not inherit Search filtering, sorting, or arbitrary resource dimensions.

Performance supports Account, Product, Ad, Target, and Campaign dimensions at hourly, daily, and monthly intervals. Product, Ad, Target, and Campaign requests identify at most 25 subjects explicitly and retain caller order. Target groups canonical Target rows by `entity_id`. Ad groups those same rows by `ad_id`. Campaign groups those same rows by `campaign_id` and does not join the campaign table. Product joins Ad identity to advertised ASIN. Every request is limited to 400 daily dates, 7 hourly dates, or 60 calendar months, and every multi-series request is limited to 5,000 points. An optional `comparisonDateRange` is a second explicit range with no preset. It must pass the interval cap on its own, and the 5,000-point pre-check counts both windows. Responses are limited to 5 MiB and execution to 10 seconds. The performance reads set `statement_timeout` locally so the database cancels the query. Cardinality is rejected before the performance query with an actionable `RESULT_TOO_LARGE` error. Byte and execution limits have separate structured errors. These limits are public safety policy and may be raised compatibly.

`performance` is the operation name; “Performance series” names its temporal result, not a second operation. Existing consumers migrate by intent: resource tables and range totals use Search, Account charts use Account Performance, and visible Product, Ad, Target, or Campaign history may use the matching Performance dimension. BidBeacon's private dashboard projections may remain while they serve private view-specific behavior, but they do not define or expand the public contract.

Removing `segments.date` and `segments.hour` from Search is intentionally breaking and requires the next lockstep app, HTTP-client, and CLI release to be v3.0.0. There is no compatibility alias or client-side pagination fallback.

## Amendment

Campaign, `comparisonDateRange`, and `activity` extend the same Performance operation. They do not add a second read and they do not add comparison to Search.

`comparison` is a sibling `{ totals, points, activity }` on the account result and on each series. `context.comparison` carries that range and its own coverage. Performance does not compute deltas and does not pair points by index.

`activity.impressionDays` counts days with impressions greater than zero. Greater than zero means the subject served. Zero means it did not serve only when that window's coverage is `COMPLETE`. Otherwise the result is inconclusive. Days enabled are not available. Change history starts on 2026-08-07 and records only BidBeacon's own edits.

The addition is additive. The release that publishes it is a minor bump, not a new major.
