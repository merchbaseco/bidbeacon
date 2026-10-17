---
summary: Defines the complete bounded temporal Performance operation.
read_when:
  - changing public performance inputs, outputs, limits, coverage, CLI, MCP, or client types
  - building a chart or Product performance-history consumer
---

# Performance API

Performance returns one complete bounded temporal measurement. It is the public read for charts and time comparisons; Search remains the paginated read for resource snapshots and range-aggregated resource tables.

## Input

```ts
client.performance.query({
  accountId,
  dimension: 'account',
  interval: 'day',
  dateRange: { startDate: '2026-07-12', endDate: '2026-08-10' },
  metrics: ['impressions', 'spend', 'sales', 'orders'],
});
```

`dimension` is `account`, `product`, `ad`, `target`, or `campaign`. Product, Ad, Target, and Campaign requests require `entityIds`, an explicit ordered list of at most 25 identifiers. Account forbids it. Campaign groups the canonical Target-grain rows by `campaign_id`. Performance does not join the campaign table and does not return names. An unknown or archived campaign id still returns a zero-filled series. Performance does not accept Search filters, ordering, fields, limits, or cursors. `interval` is `hour`, `day`, or `month`. Dates are inclusive account-local `YYYY-MM-DD` values. Metrics are selected from `impressions`, `clicks`, `spend`, `orders`, `sales`, `acos`, `cpc`, `ctr`, `roas`, and `cvr`.

`comparisonDateRange` is optional. When present, it is a second explicit inclusive range with the same interval. There is no preset, including no previous-year shortcut. The comparison range must pass the interval cap on its own. The point pre-check counts both windows: entities × (primary buckets + comparison buckets) ≤ 5,000.

## Output

Account Performance returns `context`, `totals`, `points`, and `activity`. Product, Ad, Target, and Campaign Performance return the same context plus one `series` entry per requested identity, in caller order. Each entry contains `entityId`, `totals`, `points`, and `activity`. Target groups the canonical archive by Target ID. Ad groups it by Ad ID across that Ad's Targets. Product groups advertised ASINs across matching Ads. Campaign groups it by campaign id. Missing rows are represented by zero-filled additive metrics and denominator-safe `null` ratios.

`activity` is `{ impressionDays, firstImpressionDate, lastImpressionDate }`. It sits next to `totals`, not inside it. Daily activity counts day points whose impressions are greater than zero. Hourly activity converts each point start to an account-local date, then counts those dates. Monthly activity comes from a two-stage read: one row per day, then one row per month, using `count(*) filter (where impressions > 0)`. It does not use `count(distinct)` over raw Target rows. `impressionDays` greater than zero means the subject served in that window. Zero means it did not serve only when that window's coverage is `COMPLETE`. Any other coverage makes zero inconclusive. `firstImpressionDate` and `lastImpressionDate` are account-local dates, or `null` when `impressionDays` is zero.

Days enabled are not available. Change history starts on 2026-08-07 and records only BidBeacon's own edits, so it cannot reconstruct whether a campaign was enabled.

When `comparisonDateRange` is set, the account result and each series include a sibling `comparison` object with its own `totals`, `points`, and `activity`. `context.comparison` is `{ dateRange, coverage }` for that window. Coverage is computed separately from the primary window. Performance does not compute deltas and does not pair points by index. A leap day can make the two point lists different lengths.

Daily points use `date`. Monthly points use `month`. Hourly points use ISO `start` and `end` instants so repeated account-local hours remain distinct across daylight-saving fall-back. Context identifies the Advertiser Account UUID, timezone, currency, dimension, interval, selected metrics, exact date range, and coverage.

A successful response is atomic and has no cursor or `complete` flag. Atomic delivery is part of the operation contract. `coverage.status` and `coverage.issues` separately report whether BidBeacon has complete archive evidence: daily and monthly results use daily Target-report metadata, while hourly results use hourly Target-report metadata.

## Safety limits

| Request | Limit |
| --- | --- |
| Hourly range | 7 account-local dates |
| Daily range | 400 account-local dates |
| Monthly range | 60 calendar months |
| Product, Ad, Target, or Campaign identities | 25 IDs |
| Total points | 5,000 across both windows |
| Serialized response | 5 MiB |
| Server execution | 10 seconds |

BidBeacon computes (primary buckets + comparison buckets) × requested identities before reading performance rows. Each window must also pass the interval cap on its own. Oversized cardinality returns `RESULT_TOO_LARGE` with `estimatedPoints`, `maxPoints`, the requested dimensions, and narrowing suggestions. A serialized result beyond 5 MiB returns `RESPONSE_TOO_LARGE`. An execution beyond 10 seconds returns `EXECUTION_TIMEOUT`. The performance reads run inside `SET LOCAL statement_timeout`, so the database cancels the query instead of leaving it open after the handler returns. Callers can shorten either range, request fewer identities or metrics, or use a coarser interval.

## Consumer ownership

- Resource tables and Product range totals use Search.
- Account charts use Account Performance.
- Product history uses Product Performance only when that detail is visible or requested.
- Ad and Target sparklines use their matching Performance dimension and batch only visible identities.
- Campaign time series use Campaign Performance with explicit campaign ids. Search still owns campaign names, state, and range-ranked tables.
- Consumers do not exhaust Search cursors to construct time series.
