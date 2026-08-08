---
read_when:
  - changing advertised-product identity or titles
  - changing Amazon Product Metadata calls
  - changing Product or Ad Search results
  - changing product metadata jobs or telemetry
---

# Product metadata

BidBeacon materializes Amazon Ads Product Metadata as a marketplace-specific `(country_code, asin)` projection. Search reads this table only; CLI and MCP requests never call Amazon or evaluate freshness.

The daily Ad entity sync finds advertised ASINs and enqueues `update-product-metadata` for ASINs absent from the projection. That job calls `POST /product/metadata` in batches of up to 300 and stores titles. `refresh-product-metadata` refreshes every advertised ASIN for each enabled account weekly at Sunday 04:00 UTC.

Both jobs emit one account-level Event Stream summary per run. Payloads include trigger, requested and returned products, request count, batch-size statistics, and unresolved products. Physical Amazon calls are tracked as `getProductMetadata`; `api_metrics.item_count` exposes request batch efficiency.

The dashboard Account Data card shows hydrated Product titles over distinct advertised ASINs. Its row is green when coverage is complete and amber while titles remain unresolved. Product metadata writes emit `product-metadata:updated`, which invalidates only the focused coverage query.

Metadata failure does not invalidate entity or performance ingestion. The metadata job persists each successful batch and skips it on retry, preventing a late failure from replaying earlier Amazon calls. Existing Ad titles remain a database-only fallback while the projection warms.
