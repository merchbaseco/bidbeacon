# Amazon Ads Retry Policy

## Goals

- API endpoints must not return until the Amazon Ads request completes, including bottleneck queue time and any retries.
- Retries should be limited, predictable, and honor Amazon's rate-limit guidance.

## Policy

- Applies to all Amazon Ads API calls (reads, writes, job-starting calls).
- Each request is throttled through the shared Bottleneck limiter before sending.
- Retry up to 2 times (3 total attempts).
- Retryable conditions: HTTP 408, 409, 429, 500, 502, 503, 504, plus network errors.
- Backoff is exponential: 1s, then 2s (capped at 10s). If `Retry-After` is present, wait at least that long plus 100ms.
- The API stays synchronous for these operations; no early success responses.

## Implementation

- `src/amazon-ads/throttled-fetch.ts` defines `AMAZON_ADS_API_RETRY` and handles backoff + `Retry-After`.
- Amazon Ads wrappers pass `retry: AMAZON_ADS_API_RETRY` to `throttledFetch`.
