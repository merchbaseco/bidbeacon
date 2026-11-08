# Performance Data Sources

BidBeacon stores two canonical performance projections that come from different Amazon Ads report pipelines:

- `performance_hourly`: Hourly report data (target-level) used for intra-day charts (e.g. Today/Yesterday).
- `performance_daily`: Canonical Target-grain daily observations used for day/month ranges (e.g. This Week/This Month/Custom > 1 day) and all performance-bearing Search resources. Recent dates are re-derived from `performance_hourly` when it is fresher (see Source Precedence).
Marketing Stream data is rolled into `performance_hourly` every five minutes over a trailing 24-hour window, rounded outward to the oldest whole hour bucket. Existing rows are updated only when their values change, keeping live data fresh without rewriting unchanged buckets. Stream owns buckets at or after that boundary; hourly-grain report parsing skips those buckets so a report cannot be immediately overwritten by the next Stream rollup. Reports own strictly older buckets.

Amazon hourly-grain reports reconcile Stream data after an account-local date closes. Each metadata row and API request covers one local date (the report still returns `hour.value` rows). Metadata retains exactly 14 account-local dates, including the current date, matching Amazon's hourly history window. Reconciliation runs every three hours during the first post-close day, then at 3 days, 7 days, and 13 days 21 hours. This keeps Stream as the low-latency source while using reports to catch late or corrected data without requesting the same full-day report once per hour.

Search and Performance treat rows with `entity_type = target` as the canonical performance grain. Search regroups Campaign, Ad-group, Ad, Target, and Product resource totals from the daily projection. Performance uses the hourly projection for hourly points and the daily projection for daily and monthly points. Target Performance groups by `entity_id`, Ad Performance groups by `ad_id`, and Product Performance joins `ad_id` to the Ad's advertised ASIN; it does not use the target ASIN, which describes a targeting condition.

These datasets **do not always reconcile** 1:1. Amazon’s hourly and daily reports are generated from different pipelines and can differ because of:

- Reporting cadence and backfill timing (hourly is more volatile).
- Attribution updates that settle later in daily reports.
- Target-level aggregation nuances.

## Source Precedence

`performance_daily` is the single day-grain dataset: Search and every day or month range read it, and it carries the freshest available source for each date. Readers never choose between tables for day totals.

For each account-local date, the source refreshed most recently wins:

- **Hourly as-of** is the later of the Stream as-of (counted only while the rollup's trailing window still reaches into the date) and the creation time of the last processed hourly-grain report (`lastReportCreatedAt`, trusted only when that metadata row is `completed` with no report in flight).
- **Stream as-of** is the older of the latest successful rollup start (`job_metrics.started_at`) and the latest AMS message stored for the advertiser (`received_at` on `ams_sp_traffic` / `ams_sp_conversion`, refreshed on every upsert). A successful job alone proves nothing. Stream is not fresh when no AMS message arrived in the last 30 minutes or the account has no entity id. AMS traffic arrives in hourly bursts, so a healthy Stream drops out of freshness for part of most hours; nothing new arrived then, and the date simply keeps its last rows.
- **Daily as-of** is the daily report's `lastReportCreatedAt`. A report reflects Amazon when it was requested, so creation time, not parse time, is the comparison. While a newer daily report is in flight this is an upper bound, so derivation pauses and the existing rows stay until it lands. Ties go to the daily report.

When hourly is newer, `summarize-daily-target-stream-for-account` replaces the date's Target rows with the sum of its hourly buckets (bucket_start within the account-local day, so DST days sum 23 or 25 hours), keyed by `ad_id`, `entity_type` and `entity_id`. One transaction upserts changed rows and deletes rows hourly no longer has. A newer hourly source with no rows never erases a date the daily report filled.

When a daily report is parsed, it replaces its date in one transaction too: rows absent from the report are removed, except when the report is empty or when a report row for that ad failed Target lookup. Both writers take the same per-account, per-date advisory lock and the derivation reads report metadata after acquiring it, so a derivation decided before a daily report landed cannot overwrite it.

The refresh covers today and the two most recent closed dates. It runs after every successful hourly Stream rollup (every five minutes), after any report is processed, and from the 15-minute `summarize-daily-target-stream` fallback schedule. A run records a per-date event only when that date's source or derived row count changed since its last event, for example `daily target · Nov 6` derived from hourly (newer than daily report), with both as-of times and row counts. In practice:

- **Today** has no daily report, so it is the Stream sum.
- **Yesterday** follows Stream and the three-hourly hourly-grain reconciliation; the T+1 daily report was requested at local midnight, before most late attribution.
- **Two days ago** compares the T+2 daily report with the +24-hour hourly report, which run at about the same time.
- **Older dates** keep the daily report (T+3 and later), which Amazon settles with attribution.

Hourly-grain reports are in Amazon's hourly pipeline, so derived day totals can differ slightly from Amazon's later daily report for the same date. The next daily report for that date replaces the derived rows.

If you see mismatches versus Amazon for a recent date, check the job's events for which source the date used before comparing tables.
