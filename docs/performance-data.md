# Performance Data Sources

BidBeacon stores three canonical performance projections that come from different Amazon Ads report pipelines:

- `performance_hourly`: Hourly report data (target-level) used for intra-day charts (e.g. Today/Yesterday).
- `performance_daily`: Daily report data used for day/month ranges (e.g. This Week/This Month/Custom > 1 day).
- `performance_daily_placement`: Daily Sponsored Products Campaign-placement report data used by Campaign Search when `segments.placement` is selected.

`performance_daily_placement` owns the Campaign/date/placement grain: its primary key is `(account_id, country_code, bucket_date, campaign_id, placement)`, with `bucket_start` stored as the UTC instant for the account-local `bucket_date`. Placement values are normalized to `TOP_OF_SEARCH`, `REST_OF_SEARCH`, `PRODUCT_PAGE`, or `AMAZON_BUSINESS` during ingestion. Source rows that normalize to the same public key are summed before persistence, and each clean report atomically reconciles rows removed by Amazon. Its report metadata uses `entity_type = placement`, its own coverage evidence, the shared Amazon report retry policy, and a 90-account-local-date retention window including today. Lifecycle cleanup removes out-of-window metadata and projection rows. Placement is deliberately absent from the ordinary ASIN/Target `performance_daily` primary key.

Marketing Stream data is rolled into `performance_hourly` every five minutes over a trailing 24-hour window, rounded outward to the oldest whole hour bucket. Existing rows are updated only when their values change, keeping live data fresh without rewriting unchanged buckets. Stream owns buckets at or after that boundary; hourly-grain report parsing skips those buckets so a report cannot be immediately overwritten by the next Stream rollup. Reports own strictly older buckets.

Amazon hourly-grain reports reconcile Stream data after an account-local date closes. Each metadata row and API request covers one local date (the report still returns `hour.value` rows). Metadata retains exactly 14 account-local dates, including the current date, matching Amazon's hourly history window. Reconciliation runs every three hours during the first post-close day, then at 3 days, 7 days, and 13 days 21 hours. This keeps Stream as the low-latency source while using reports to catch late or corrected data without requesting the same full-day report once per hour.

These datasets **do not always reconcile** 1:1. Amazon’s hourly and daily reports are generated from different pipelines and can differ because of:

- Reporting cadence and backfill timing (hourly is more volatile).
- Attribution updates that settle later in daily reports.
- Target-level aggregation nuances.

## UI/Data Source Policy

To align with the Amazon Ads console:

- Use `performance_hourly` only for hour-granularity ranges (Today/Yesterday, or custom ranges <= 1 day).
- Prefer `performance_daily` for day/month ranges (This Week/Month/Year, Last 30 Days, custom ranges > 1 day).

If you see mismatches versus Amazon for historical dates, validate against `performance_daily` first.
