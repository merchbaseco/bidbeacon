---
summary: Records why Search owns resource snapshots while Performance owns complete temporal reads.
read_when:
  - adding or changing a public advertising read operation
  - changing Search metrics, temporal buckets, or Performance limits
---

# Separate resource Search from temporal Performance

BidBeacon exposes two complementary public read operations. Search returns independently useful, cursor-paginated resource snapshots whose metrics are aggregated over an account-local date range; its summary covers the complete filtered resource result, but its rows never segment by date or hour. Performance returns one complete, bounded temporal result for an Account or an explicit small set of Products, with selected metrics, totals, zero-filled points, timezone, and honest archive coverage. A successful Performance call has no cursor: it returns the complete requested series or a structured size or execution error.

This supersedes [ADR 0001](0001-use-search-for-advertising-resource-reads.md). Keeping temporal segments in Search made a complete chart depend on exhaustive cursor traversal, so valid high-cardinality queries produced long-running client orchestration and unclear completeness. A family of table, chart, overview, and entity-specific endpoints was also rejected. Search and Performance instead have distinct deep contracts: resource discovery and ranking versus bounded temporal measurement. Performance deliberately does not inherit Search filtering, sorting, or arbitrary resource dimensions.

Performance v1 supports Account and Product dimensions at hourly, daily, and monthly intervals. Product requests identify at most 25 ASINs explicitly. Every request is limited to 400 daily dates, 7 hourly dates, or 60 calendar months; Product requests are additionally limited to 5,000 points. Responses are limited to 5 MiB and execution to 10 seconds. Cardinality is rejected before the performance query with an actionable `RESULT_TOO_LARGE` error; byte and execution limits have separate structured errors. These limits are public safety policy and may be raised compatibly.

`performance` is the operation name; “Performance series” names its temporal result, not a second operation. Existing consumers migrate by intent: resource tables and Product totals use Search, Account charts use Account Performance, and visible Product-detail history may use Product Performance. BidBeacon's private dashboard projections may remain while they serve private view-specific behavior, but they do not define or expand the public contract.

Removing `segments.date` and `segments.hour` from Search is intentionally breaking and requires the next lockstep app, HTTP-client, and CLI release to be v3.0.0. There is no compatibility alias or client-side pagination fallback.
