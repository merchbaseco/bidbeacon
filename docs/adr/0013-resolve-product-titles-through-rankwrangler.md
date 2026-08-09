---
summary: Records why BidBeacon resolves advertised-product titles through RankWrangler without storing them.
read_when:
  - changing advertised-product metadata ownership
  - proposing request-time product title lookups
---

# ADR 0013: Resolve product titles through RankWrangler

## Decision

Resolve advertised-product titles through RankWrangler immediately before returning a bounded Search page. BidBeacon stores advertising ASINs but does not store product titles, own their freshness, or call Amazon Product Metadata.

## Why

Amazon Product Metadata only searches inventory tied to the advertiser profile, which excludes Amazon Merch ASINs owned by Amazon Merch rather than the advertiser. It is therefore not a valid title source for BidBeacon's primary catalog.

RankWrangler owns Amazon product identity, provider access, caching, freshness, retries, and throttling. BidBeacon sends the unique marketplace/ASIN pairs from only the final Search page and merges resolved titles. Missing products or RankWrangler failures leave title fields `null` without failing the advertising Search.

Production uses RankWrangler's typed HTTP client and `product.getMany` operation. BidBeacon forwards the authenticated caller's Merchbase bearer credential for this request, preserving the same stable user identity and RankWrangler usage boundary across API, CLI, and MCP surfaces. BidBeacon does not own or configure a separate RankWrangler credential. `RANKWRANGLER_BASE_URL` may override the hosted origin.

Because titles are resolved after bounded filtering, ordering, and pagination, `product.title` and `ad.productTitle` are display-only fields. They cannot be filters or ordering fields. Settings-only Product Search orders by ASIN; performance Search retains its metric-first defaults.
