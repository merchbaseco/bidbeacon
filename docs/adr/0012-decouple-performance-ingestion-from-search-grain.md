---
summary: Records why Amazon report fields do not determine the public Search resource or row grain.
read_when:
  - changing performance ingestion, Search aggregation, Product Search, or report field bundles
---

# Decouple performance ingestion from Search grain

BidBeacon keeps one canonical Target-grain performance archive and derives each public Search resource by regrouping those observations through the advertising topology. Campaign, Ad-group, Ad, and Target rows group by their stored identifiers; Product rows join each Ad to its advertised ASIN and group by that ASIN. The Search resource determines the returned grain, while Amazon report fields remain an ingestion concern invisible to callers.

A parallel advertised-product report and archive were rejected because they duplicate the same delivery metrics, consume additional report capacity, and create competing coverage and reconciliation semantics. BidBeacon may add a new report source only when it supplies information that cannot be derived from the canonical archive and resource topology; a new source must not become a caller-selectable Search mode.
