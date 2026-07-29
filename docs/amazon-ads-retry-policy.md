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
- Backoff is exponential: 1s, then 2s (capped at 10s). If `Retry-After` is present, wait at least that long plus 100ms.
- Request timeout is 30s per HTTP attempt (not shared across queue wait + retries).
- The API stays synchronous for these operations; no early success responses.
- A 429 applies its `Retry-After` cooldown only to the affected limiter. Overlapping cooldowns retain the latest deadline; an older reset cannot shorten a newer cooldown.
- Cooldown state is persisted by limiter key, so a server restart cannot erase an active Amazon cooldown.
- If Amazon omits `Retry-After`, the governor starts near 5s, adds ±20% jitter, and doubles subsequent cooldowns up to 60s. Intermittent successes preserve the learned cooldown; it resets after five minutes without another 429.
- Report creation is single-flight per API region. When a logical report-creation call exhausts all retries on 429 responses, the shared region gate backs off for 10 minutes, then 20 minutes, then 30 minutes for subsequent exhausted calls.
- A successful recovery probe reduces the exhaustion count by one and holds the report-creation gate for ten minutes before the next report. Exhaustion state expires after 30 minutes of inactivity outside an active gate.

## Metrics

Each `api_metrics` row records the final result plus per-attempt governor data:

- `attempt_count` and `retry_count`
- `rate_limit_count`, including 429s recovered within a successful call
- `retry_after_ms`, using the largest Amazon-provided or fallback cooldown
- `queue_wait_ms`, covering time spent waiting for governor capacity

The API health rate-limit count sums attempt-level 429s. Rows recorded before these fields existed fall back to a final 429 status.

## Implementation

- `src/amazon-ads/throttled-fetch.ts` defines `AMAZON_ADS_API_RETRY` and handles isolation, priority, backoff, cooldowns, and telemetry.
- Amazon Ads wrappers pass `retry: AMAZON_ADS_API_RETRY` and `timeoutMs: 30_000` to `throttledFetch`.
