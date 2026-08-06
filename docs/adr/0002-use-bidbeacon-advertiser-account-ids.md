---
summary: Records why every account-scoped operation uses a BidBeacon Advertiser account ID.
read_when:
  - changing account discovery, routing, authentication, or account-scoped public inputs
---

# Use BidBeacon advertiser-account IDs

Every account-scoped public operation requires the opaque BidBeacon ID of one advertiser-account record. Amazon's ads account ID was rejected as the public routing identifier because it can span multiple marketplace or profile records and would force callers to supply additional country or profile context; Amazon account, profile, and marketplace identifiers remain descriptive attributes returned by account discovery.
