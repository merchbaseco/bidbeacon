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

`dimension` is `account`, `product`, `ad`, or `target`. Product, Ad, and Target requests require `entityIds`, an explicit ordered list of at most 25 identifiers; Account forbids it. Performance does not accept Search filters, ordering, fields, limits, or cursors. `interval` is `hour`, `day`, or `month`; dates are inclusive account-local `YYYY-MM-DD` values. Metrics are selected from `impressions`, `clicks`, `spend`, `orders`, `sales`, `acos`, `cpc`, `ctr`, `roas`, and `cvr`.

## Output

Account Performance returns `context`, `totals`, and `points`. Product, Ad, and Target Performance return the same context plus one `series` entry per requested identity, in caller order; each entry contains `entityId`, `totals`, and `points`. Target groups the canonical archive by Target ID, Ad groups it by Ad ID across that Ad's Targets, and Product groups advertised ASINs across matching Ads. Missing activity is represented by zero-filled additive metrics and denominator-safe `null` ratios.

Daily points use `date`; monthly points use `month`. Hourly points use ISO `start` and `end` instants so repeated account-local hours remain distinct across daylight-saving fall-back. Context identifies the Advertiser Account UUID, timezone, currency, dimension, interval, selected metrics, exact date range, and coverage.

A successful response is atomic and has no cursor or `complete` flag. Atomic delivery is part of the operation contract. `coverage.status` and `coverage.issues` separately report whether BidBeacon has complete archive evidence: daily and monthly results use daily Target-report metadata, while hourly results use hourly Target-report metadata.

## Safety limits

| Request | Limit |
| --- | --- |
| Hourly range | 7 account-local dates |
| Daily range | 400 account-local dates |
| Monthly range | 60 calendar months |
| Product, Ad, or Target identities | 25 IDs |
| Total points | 5,000 |
| Serialized response | 5 MiB |
| Server execution | 10 seconds |

BidBeacon computes time buckets × requested identities before reading performance rows. Oversized cardinality returns `RESULT_TOO_LARGE` with `estimatedPoints`, `maxPoints`, the requested dimensions, and narrowing suggestions. A serialized result beyond 5 MiB returns `RESPONSE_TOO_LARGE`; an execution beyond 10 seconds returns `EXECUTION_TIMEOUT`. Callers can shorten the range, request fewer identities or metrics, or use a coarser interval.

## Consumer ownership

- Resource tables and Product range totals use Search.
- Account charts use Account Performance.
- Product history uses Product Performance only when that detail is visible or requested.
- Ad and Target sparklines use their matching Performance dimension and batch only visible identities.
- Consumers do not exhaust Search cursors to construct time series.
