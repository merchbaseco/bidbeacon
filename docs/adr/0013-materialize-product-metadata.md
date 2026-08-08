---
read_when:
  - changing advertised-product metadata ownership
  - proposing request-time Amazon product lookups
---

# ADR 0013: Materialize Amazon product metadata

## Decision

Materialize Amazon Ads Product Metadata by marketplace and ASIN. Hydrate unseen advertised ASINs after the daily Ad entity sync and refresh the complete advertised catalog weekly. Public Search reads the database projection and never calls Amazon.

## Why

Amazon's Product Metadata API supplies human-readable titles missing from Ad exports, but it is externally throttled and operationally observable. Request-time hydration would make read latency and reliability depend on Amazon and could turn agent exploration into an accidental call storm. A continuously running refresh queue is unnecessary for metadata with a one-week freshness target.

The two explicit jobs make intent visible: `update-product-metadata` handles a bounded set of new ASINs; `refresh-product-metadata` handles the whole account catalog. Both batch at Amazon's 300-ASIN request limit and expose aggregate Event Stream and per-request API metrics.
