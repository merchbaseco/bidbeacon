---
read_when:
  - changing advertised-product identity or titles
  - changing Amazon Product Metadata calls
  - changing Product or Ad Search results
  - changing product metadata jobs or telemetry
---

# Product metadata

BidBeacon materializes Amazon Ads Product Metadata as a marketplace-specific `(country_code, asin)` projection. Search reads this table only; CLI and MCP requests never call Amazon or evaluate freshness.

`update-product-metadata` hydrates a bounded set of ASINs and `refresh-product-metadata` refreshes an account catalog. Both are explicit jobs while Amazon's Product Metadata inventory behavior is being validated for Merch vendor profiles; entity sync and the worker schedule do not dispatch them automatically.

Both jobs emit one account-level Event Stream summary per run. Payloads include trigger, requested and returned products, request count, batch-size statistics, and unresolved products. Physical Amazon calls are tracked as `getProductMetadata`; `api_metrics.item_count` exposes request batch efficiency.

The dashboard Account Data card shows hydrated Product titles over distinct advertised ASINs. Its row is green when coverage is complete and amber while titles remain unresolved. Product metadata writes emit `product-metadata:updated`, which invalidates only the focused coverage query.

Metadata failure does not invalidate entity or performance ingestion. The metadata job stops when its first batch returns no matching inventory, persists each successful batch, and skips it on retry, preventing an unsupported profile or late failure from replaying the full catalog. Existing Ad titles remain a database-only fallback while the projection warms.
