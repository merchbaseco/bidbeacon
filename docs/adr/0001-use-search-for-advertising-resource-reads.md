---
summary: Records why one Search operation owns all advertising-resource reads.
status: superseded by ADR-0014
read_when:
  - adding or changing a public advertising read operation
---

# Use Search for advertising-resource reads

BidBeacon exposes Search as the sole public read operation for advertising resources, including lookup by ID, lists, performance, and change history. Separate get, list, table, series, tree, and overview operations were rejected because their overlapping filters and response contracts would fragment the CLI, MCP, and HTTP interfaces. Account discovery remains separate because it resolves the explicit Account ID required by Search; the curated Field catalog lives in the Search schema and performance coverage lives in Search response context.

Superseded by [ADR 0014](0014-separate-resource-search-from-temporal-performance.md), which preserves Search for resource snapshots while giving complete temporal performance a separate atomic contract.
