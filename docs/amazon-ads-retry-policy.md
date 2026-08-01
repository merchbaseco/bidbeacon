# Amazon Ads Retry Policy

## Goals

- API endpoints must not return until the Amazon Ads request completes, including bottleneck queue time and any retries.
- Retries should be limited, predictable, and honor Amazon's rate-limit guidance.

## Policy

- Applies to all Amazon Ads API calls (reads, writes, job-starting calls).
- Ordinary requests use a shared Bottleneck limiter. Report creation uses a separate limiter per API region so report queue pressure cannot delay unrelated Amazon Ads operations.
- Normal pacing remains two concurrent requests with at least 500ms between request starts.
- Report creation prioritizes recent periods over historical backfills without reducing the normal request rate.
- Retry up to 2 times (3 total attempts).
- Retryable conditions: HTTP 408, 409, 429, 500, 502, 503, 504, plus network errors.
- Report creation is the exception: a 429 is not retried within the same logical call. Network errors and retryable non-429 responses still use the normal retry policy.
- Backoff is exponential: 1s, then 2s (capped at 10s). If `Retry-After` is present, wait at least that long plus 100ms.
- Request timeout is 30s per HTTP attempt (not shared across queue wait + retries).
- The API stays synchronous for these operations; no early success responses.
- A 429 applies its `Retry-After` cooldown only to the affected limiter. Overlapping cooldowns retain the latest deadline; an older reset cannot shorten a newer cooldown.
- Cooldown state is persisted by limiter key, so a server restart cannot erase an active Amazon cooldown.
- If Amazon omits `Retry-After`, the governor starts near 5s, adds ±20% jitter, and doubles subsequent cooldowns up to 60s. Intermittent successes preserve the learned cooldown; it resets after five minutes without another 429.

## Report creation pacing

Report creation has a separate governor because Amazon documents reporting limits as dynamic, per-region tiers based on the report-generation queue. Amazon also says those tiers are unlikely to change over short periods. A successful creation therefore means only that Amazon admitted that request; it is not evidence that the region has recovered.

- The governor is single-flight and isolated per Amazon API region (`report-create:na`, `report-create:eu`, or `report-create:fe`). Amazon documents reporting tiers per region and does not publish a separate per-account quota for this endpoint, so BidBeacon conservatively shares one report-creation gate across accounts in the same region. A 429 therefore pauses new report creation for every account in that region; with the current NA-only deployment, that means every BidBeacon account.
- Marketing Stream processing and non-report Amazon API calls use separate limiters and are not delayed by report recovery.
- Successful report creations start at least five minutes apart. Recent periods retain queue priority, so pacing does not let historical backfills jump ahead of fresh reconciliation.
- A report-creation 429 ends that logical call after one HTTP attempt. Retrying the same request seconds later adds load without a documented chance of entering a different rate tier.
- When Amazon sends `Retry-After`, the region gate honors it plus 100ms and never shortens the normal five-minute report spacing.
- When Amazon omits `Retry-After`, the region gate waits 48–72 minutes: a one-hour fallback with ±20% jitter.
- The affected dataset and any report work already queued behind it are deferred to the gate deadline and released from the worker immediately. A pg-boss job never sleeps through report pacing or cooldown.
- A 429 and any resulting local deferrals are recorded in API metrics and the event stream but do not put the dataset into an error state. Repeated deferrals remain visible without presenting expected governor behavior as a broken report.
- The region gate is persisted in `api_rate_limit_state`, so deployments and restarts cannot erase it.

This design follows Amazon's guidance to use longer report backoffs and distribute report generation throughout the day. Marketing Stream remains the low-latency source; reports reconcile prior data.

## Metrics

Each `api_metrics` row records the final result plus per-attempt governor data:

- `attempt_count` and `retry_count`
- `rate_limit_count`, including 429s recovered within a successful call
- `amazon_retry_after_ms`, containing only a `Retry-After` value Amazon actually returned
- `governor_cooldown_ms`, containing the effective local cooldown
- `rate_limit_request_id`, `rate_limit_response_content_type`, and `rate_limit_response_server`, capturing the latest 429 response provenance
- `queue_wait_ms`, covering time spent waiting for governor capacity

The API health rate-limit count sums attempt-level 429s. Rows recorded before these fields existed fall back to a final 429 status. Historical `retry_after_ms` values were a mixture of Amazon headers and local fallbacks; migration 0052 renames that column to `governor_cooldown_ms` and begins recording Amazon's header separately.

## Source contract

- Amazon Ads rate limiting: https://advertising.amazon.com/API/docs/en-us/reference/concepts/rate-limiting
- Unified Reporting API overview: https://advertising.amazon.com/API/docs/en-us/guides/reporting/ads-v1/overview
- Unified Reporting API beta specification: https://advertising.amazon.com/API/docs/en-us/amazon-ads/1-0/betas#tag/Reports

## Implementation

- `src/amazon-ads/throttled-fetch.ts` defines the ordinary and report-creation retry policies and handles isolation, priority, backoff, cooldowns, and telemetry.
- Amazon Ads wrappers use `AMAZON_ADS_API_RETRY`; report creation uses `AMAZON_ADS_REPORT_CREATE_RETRY`. Both use a 30-second timeout per attempt.
