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

## Report creation recovery

Report creation has a separate, adaptive governor because Amazon can accept a few reports and then temporarily reject the next one even when requests are serialized.

- The governor is single-flight and isolated per Amazon API region (`report-create:na`, `report-create:eu`, or `report-create:fe`). The same policy applies to every region.
- Marketing Stream processing and non-report Amazon API calls use separate limiters and are not delayed by report recovery.
- Any report-creation 429 starts a recovery phase requiring three consecutive clean logical report creations. A call that encounters a 429 and later succeeds on retry is successful, but not clean.
- When a logical call exhausts all three attempts on 429 responses, the region gate waits 10 minutes. Consecutive exhausted calls escalate that gate to 20 minutes, then 30 minutes.
- Each clean recovery probe reduces the remaining probe count by one. Probes stay ten minutes apart until three succeed consecutively; normal single-flight pacing then resumes.
- Any 429 during recovery resets the clean-probe requirement to three. A successful probe also reduces the exhaustion count by one.
- Recovery and exhaustion state expire after 30 minutes without another 429. The state is persisted in `api_rate_limit_state`, including `exhaustion_count` and `recovery_probes_remaining`, so deployments and restarts preserve active recovery.

## Metrics

Each `api_metrics` row records the final result plus per-attempt governor data:

- `attempt_count` and `retry_count`
- `rate_limit_count`, including 429s recovered within a successful call
- `retry_after_ms`, using the largest Amazon-provided or fallback cooldown
- `queue_wait_ms`, covering time spent waiting for governor capacity

The API health rate-limit count sums attempt-level 429s, so one logical call can contribute up to three. Rows recorded before these fields existed fall back to a final 429 status.

For an exhausted report-creation call, `retry_after_ms` can contain the governor's 10-, 20-, or 30-minute exhaustion gate. It does not prove Amazon sent a `Retry-After` header.

## Implementation

- `src/amazon-ads/throttled-fetch.ts` defines `AMAZON_ADS_API_RETRY` and handles isolation, priority, backoff, cooldowns, and telemetry.
- Amazon Ads wrappers pass `retry: AMAZON_ADS_API_RETRY` and `timeoutMs: 30_000` to `throttledFetch`.
