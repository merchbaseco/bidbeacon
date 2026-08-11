# Performance Data Sources

BidBeacon stores two canonical performance projections that come from different Amazon Ads report pipelines:

- `performance_hourly`: Hourly report data (target-level) used for intra-day charts (e.g. Today/Yesterday).
- `performance_daily`: Canonical Target-grain daily observations used for day/month ranges (e.g. This Week/This Month/Custom > 1 day) and all performance-bearing Search resources.
Marketing Stream data is rolled into `performance_hourly` every five minutes over a trailing 24-hour window, rounded outward to the oldest whole hour bucket. Existing rows are updated only when their values change, keeping live data fresh without rewriting unchanged buckets. Stream owns buckets at or after that boundary; hourly-grain report parsing skips those buckets so a report cannot be immediately overwritten by the next Stream rollup. Reports own strictly older buckets.

Amazon hourly-grain reports reconcile Stream data after an account-local date closes. Each metadata row and API request covers one local date (the report still returns `hour.value` rows). Metadata retains exactly 14 account-local dates, including the current date, matching Amazon's hourly history window. Reconciliation runs every three hours during the first post-close day, then at 3 days, 7 days, and 13 days 21 hours. This keeps Stream as the low-latency source while using reports to catch late or corrected data without requesting the same full-day report once per hour.

Search and Performance treat rows with `entity_type = target` as the canonical performance grain. Search regroups Campaign, Ad-group, Ad, Target, and Product resource totals from the daily projection. Performance uses the hourly projection for hourly points and the daily projection for daily and monthly points. Target Performance groups by `entity_id`, Ad Performance groups by `ad_id`, and Product Performance joins `ad_id` to the Ad's advertised ASIN; it does not use the target ASIN, which describes a targeting condition.

These datasets **do not always reconcile** 1:1. Amazon’s hourly and daily reports are generated from different pipelines and can differ because of:

- Reporting cadence and backfill timing (hourly is more volatile).
- Attribution updates that settle later in daily reports.
- Target-level aggregation nuances.

## UI/Data Source Policy

To align with the Amazon Ads console:

- Use `performance_hourly` only for hour-granularity ranges (Today/Yesterday, or custom ranges <= 1 day).
- Prefer `performance_daily` for day/month ranges (This Week/Month/Year, Last 30 Days, custom ranges > 1 day).

If you see mismatches versus Amazon for historical dates, validate against `performance_daily` first.
