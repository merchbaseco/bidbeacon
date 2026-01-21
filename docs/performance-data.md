# Performance Data Sources

BidBeacon stores two primary performance datasets that come from different Amazon Ads report pipelines:

- `performance_hourly`: Hourly report data (target-level) used for intra-day charts (e.g. Today/Yesterday).
- `performance_daily`: Daily report data used for day/month ranges (e.g. This Week/This Month/Custom > 1 day).

These datasets **do not always reconcile** 1:1. Amazon’s hourly and daily reports are generated from different pipelines and can differ because of:

- Reporting cadence and backfill timing (hourly is more volatile).
- Attribution updates that settle later in daily reports.
- Target-level aggregation nuances.

## UI/Data Source Policy

To align with the Amazon Ads console:

- Use `performance_hourly` only for hour-granularity ranges (Today/Yesterday, or custom ranges <= 1 day).
- Prefer `performance_daily` for day/month ranges (This Week/Month/Year, Last 30 Days, custom ranges > 1 day).

If you see mismatches versus Amazon for historical dates, validate against `performance_daily` first.
