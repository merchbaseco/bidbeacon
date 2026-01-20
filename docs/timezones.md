# BidBeacon Timezones

Goal: match Amazon Ads console behavior as closely as possible.

## Amazon Ads reference behavior (external)

- Reports: report dates are interpreted in the profile/account timezone, and reports are generated relative to that profile timezone (not the viewer's browser timezone).
- Marketing Stream: `time_window_start` represents the start of the hour for the performance data window, and the API examples show ISO 8601 timestamps with a timezone offset.

Notes:
- I was not able to load the English Amazon Ads docs URLs from `advertising.amazon.com` in this environment (the pages render via JS and came back empty). I used the official Amazon Ads API Chinese docs for Marketing Stream examples and third-party platform docs for the reports timezone behavior. Those should be verified against the English Amazon Ads docs when available.

## Current BidBeacon timezone model

### Source assumptions

- **Account timezone** is derived from country code via `src/utils/timezones.ts`.
  - US/MX/CA => America/Los_Angeles
  - EU (DE/ES/FR/IT/GB) => Europe/London
  - JP => Asia/Tokyo
  - fallback => UTC
- **Current product assumption:** Amazon Ads treats US profiles as PT (does not differentiate ET/CT/MT). If this changes or differs per profile, we should revisit the mapping.

### Storage model

- `performance_hourly.bucket_start` is UTC `timestamptz` (canonical). `bucket_date` and `bucket_hour` are account-local labels.
- `performance_daily.bucket_start` is UTC `timestamptz`. `bucket_date` is account-local label.
- `report_dataset_metadata.period_start` is a timezone-less timestamp but represents a UTC instant (start of hour/day in account timezone).
- `report_dataset_metadata.last_report_created_at` is a timezone-less timestamp that represents local time in the account timezone.

### Report ingestion flow (Amazon Ads Reports API)

- `update-report-dataset-for-account` creates report metadata windows using `zonedTopOfHour` / `zonedStartOfDay` with the account timezone.
- `createReportForDataset` converts `period_start` to `startDate`/`endDate` using `formatInTimeZone(..., accountTimezone, 'yyyy-MM-dd')` so report windows match the account-local day.
- `parse-report/*` converts report `date.value` + `hour.value` into:
  - `bucketStart` (UTC instant)
  - `bucketDate` / `bucketHour` (account-local labels)
  - uses `fromZonedTime` under the hood to handle DST transitions correctly.

### Marketing Stream flow (AMS)

- `ams_sp_*` tables store `time_window_start` as `timestamptz` (Date from the payload string).
- `summarize-hourly-*` converts `time_window_start` to `bucketDate`/`bucketHour` using the account timezone.
- `summarize-daily-*` selects the account-local day window and aggregates AMS rows into `performance_daily`.

### UI / API usage

- Event stream API returns `timezone: getTimezoneForCountry(countryCode)` and UI formats events in that timezone.
- Hourly chart (`metrics.hourlyPerformance`) uses **browser timezone** for daily boundaries and for hour labels, grouping via `AT TIME ZONE` in SQL. This is **intentional** to match advertising.amazon.com behavior (viewer-local “today”).

## Consistency review (vs Amazon Ads console)

### What matches well

- Canonical storage in UTC with local labels (`bucket_date`, `bucket_hour`) aligns with Amazon Ads reporting patterns and DST behavior.
- Parsing report rows into account-local buckets is aligned with the report output format.
- AMS ingestion stores `time_window_start` as a proper timestamp and uses account-local buckets for rollups.

### Likely mismatches / risks

1. **Country-based timezone mapping is only correct if Amazon uses a single timezone per country.**
   - This is believed to be true for US profiles (PT), but if Amazon introduces per-profile timezones, we should store and use them.
   - This would impact report windows, AMS rollups, and UI formatting.

2. **DST edge cases need explicit verification.**
   - `parseHourlyTimestamp` derives offsets using `Intl.DateTimeFormat` and should be correct, but ambiguous fall-back hours are inherently tricky.
   - The data model supports duplicate local hours; we should validate the mapping on DST transitions.

## Recommendations / improvements

1. **Store real account/profile timezone.**
   - Add a `timezone` column to `advertiser_account` and populate it from the Amazon Ads Profiles API (or equivalent account metadata).
   - Replace `getTimezoneForCountry` usage with the stored profile timezone; keep country fallback for missing data only.

2. **Add timezone regression tests.**
   - Add unit tests for:
     - Report date formatting in timezones ahead/behind UTC.
     - DST transitions (spring forward and fall back) for `parseHourlyTimestamp`.
     - `getNextRefreshTime` behavior around timezone changes.

3. **Document the Amazon Ads timezone contract.**
   - Once the English docs are accessible, capture the exact language around report timezones and AMS timestamps in this doc for long-term reference.
