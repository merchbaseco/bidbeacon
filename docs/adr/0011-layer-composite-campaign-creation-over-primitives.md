---
summary: Records why ordinary Sponsored Products creation is one synchronous composite over explicit primitives.
read_when:
  - changing campaign creation, targeting, negative targets, partial failures, or mutation approval
---

# Layer composite campaign creation over primitives

BidBeacon exposes `create_sponsored_products_campaign` as the preferred operation for ordinary end-to-end campaign creation. One request describes the campaign, initial ad group, advertised ASINs, and targeting; BidBeacon validates the complete specification and orchestrates the ordered Amazon operations.

The request requires `state: ENABLED | PAUSED`, using the same `state` field and values as every other advertising resource. `ENABLED` creates and launches the campaign; `PAUSED` creates it without beginning spend. BidBeacon does not impose a prepare/create or create/enable handshake. Interactive approval belongs to the MCP host around the single consequential tool call, while autonomous hosts may apply their own programmatic approval policy. An optional validation operation may be added if previewing Amazon eligibility proves useful, but it is not a prerequisite for creation.

The composite supports the three Sponsored Products targeting choices exposed by Amazon's campaign builder: automatic targeting, manual keyword targeting, and manual product targeting. One composite request creates one initial ad group with exactly one targeting method; it cannot mix keyword and product targets. Separate strategies use separate campaigns or ad groups, keeping construction and later performance attribution legible.

Manual product targeting accepts individual ASIN targets only. Amazon category, brand, price, rating, and other refinement expressions are outside the initial public surface; they can be added if concrete Merch workflows justify their substantially larger schema.

Automatic targeting uses the ad group's required `defaultBid` as its fallback and accepts optional bid overrides for Amazon's four automatic target groups: close match, loose match, substitutes, and complements. Omitted overrides inherit `defaultBid`.

Composite campaign settings accept optional placement bid adjustments for top of search, rest of search, product pages, and Amazon Business. The same field is patchable through `update_campaign`.

Composite creation accepts optional ad-group negative keywords and negative ASINs. The primitive surface adds `create_negative_keyword` and `create_negative_product_target`, both requiring a Campaign ID and Ad group ID. Existing negatives remain Target resources and are removed by setting `state: ARCHIVED` through `update_target`.

Creating campaign-level negatives is outside the initial public write surface. BidBeacon still reads and reports campaign-level negatives already present in Amazon, and `update_target` may archive one by ID. This preserves an accurate account view without adding scope unions, separate Amazon endpoint concepts, or campaign-only restrictions to common creation tools. Campaign-level creation can be added if multi-ad-group workflows demonstrate a need.

Composite creation executes synchronously. BidBeacon validates the complete request before the first Amazon write, creates the campaign in `PAUSED`, creates the ad group, ads, and targets in `ENABLED`, and applies the requested campaign state only after every required child succeeds. The campaign is the sole delivery gate, so a complete paused topology can later launch through one `update_campaign` call without separately enabling its children. If a later Amazon operation fails, BidBeacon leaves every successful resource under the paused campaign and returns a model-visible tool execution error that identifies the paused campaign, every successful resource, the failed input, and Amazon's useful error details. Partial completion does not complicate the ordinary success schema with a second result shape. BidBeacon does not attempt compensating archive or delete calls: Amazon offers no transaction, cleanup can also fail, and the paused campaign already prevents spend. The agent may repair or clean up the disclosed topology through the primitive operations.

On success, the composite returns the canonical BidBeacon representations of the created campaign, ad group, ads, and targets. This confirms the state Amazon accepted and supplies every identifier needed for later operations. The response reuses the same deliberately small resource vocabulary as Search and updates; it does not return metrics, repeat ancestry on every child, echo unrelated request data, or expose Amazon's full records. Identifier-only responses were rejected because a composite financial action benefits from confirming its resolved budget, bids, state, ASINs, and targeting.

The public surface also retains the complete symmetric primitive set:

- `create_campaign`
- `create_ad_group`
- `create_ad`
- `create_keyword_target`
- `create_product_target`
- `create_negative_keyword`
- `create_negative_product_target`

Every primitive creation request also requires `state: ENABLED | PAUSED`; there are no resource-specific creation defaults. `ARCHIVED` is valid only when updating an existing resource.

Endpoint-only creation was rejected because it forces agents to coordinate a routine multi-step workflow and propagate intermediate IDs. Composite-only creation was rejected because it would prevent bespoke layouts, extension of existing campaigns, and recovery from partially completed workflows. A mandatory two-step approval workflow was rejected because it makes agents coordinate server ceremony that capable MCP hosts already handle at the invocation boundary. Agent-supplied idempotency keys, background execution, and automatic rollback were rejected as unnecessary orchestration ceremony or unreliable substitutes for a synchronous, safely gated workflow. Tool descriptions and the Amazon Ads skill prefer the composite operation for ordinary creation while leaving the primitives as explicit escape hatches.
