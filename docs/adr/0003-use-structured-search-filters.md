---
summary: Records why Search uses schema-constrained filters instead of a query language.
read_when:
  - changing Search filters, operators, or CLI where syntax
---

# Use structured Search filters

Search accepts filters as structured field, operator, and value objects; the CLI may parse concise `--where` expressions into that same representation. Query-language strings were rejected as the canonical interface because BidBeacon has no established query language like GAQL, while structured filters let MCP's JSON Schema constrain operators and value shapes before execution; this follows Amazon Ads' schema-driven filtering while preserving a smaller interface.
