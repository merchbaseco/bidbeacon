---
summary: Records why BidBeacon owns a compact public Field and control vocabulary.
read_when:
  - adding or renaming Search fields, metrics, segments, budgets, or bid strategies
---

# Own a stable Field vocabulary

BidBeacon owns a deliberately small public vocabulary of Search fields, metrics, and segments while mapping Amazon report-version-specific columns internally. The complete v1 catalog is exposed directly in the Search tool schema and CLI documentation; a separate field-metadata operation is not provided. Resource validation errors identify the allowed fields when a caller selects an incompatible field.

Public bidding strategies use Amazon's advertiser-facing dashboard language: `FIXED`, `DYNAMIC_DOWN_ONLY`, and `DYNAMIC_UP_AND_DOWN`. BidBeacon maps these to Amazon API transport values internally. API terms such as `MANUAL` and `SALES_DOWN_ONLY` are not public because `MANUAL` conflicts with manual targeting and neither form matches the language agents and advertisers ordinarily encounter.

Sponsored Products budget uses `dailyBudget` consistently in Search, creation, and updates. Generic `budgetAmount` and nested budget type or period fields are not public because the supported campaign product has one advertiser-facing daily budget concept.

Mirroring Amazon's field catalog was rejected because most source columns do not serve BidBeacon's Merch-oriented observation and optimization workflows, and upstream terminology and versions change. A compact catalog improves agent selection, keeps the MCP surface understandable, and gives BidBeacon's archive, CLI, saved queries, and long-term comparisons a durable contract. A metadata operation can be added later without changing Search if the curated catalog eventually outgrows direct documentation.
