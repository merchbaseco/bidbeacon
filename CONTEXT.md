# BidBeacon

BidBeacon is a durable archive and automation layer for Amazon advertising, with first-class support for Merch-oriented analysis.

## Language

**Search**:
The public read operation for independently useful, cursor-paginated advertising resource snapshots, including current state, range-aggregated performance, and change history. Search never returns temporal segments.
_Avoid_: Get operation, list operation, metrics table, temporal series

**Search resource**:
A public advertising resource or reporting view that determines the primary grain of each Search row. A Search may select fields from that resource and its ancestors, but never from its children.
_Avoid_: Group by, root entity

**Metric Search**:
A Search whose resource rows include metrics aggregated over a requested or deterministic default account-local date range. It always reports the exact resolved range and its source.
_Avoid_: Performance Search, segmented Search, unstated reporting window

**Performance**:
The public read operation for one complete, bounded temporal measurement of an Advertiser account or an explicit small set of Products. It returns selected metric totals and ordered zero-filled points without a cursor, or rejects the request with a structured size or execution error.
_Avoid_: Chart operation, report job, generic analytics query

**Performance dimension**:
The subject measured by Performance: the whole Advertiser account or an explicitly identified Product. Dimension is distinct from interval; together they determine point cardinality.
_Avoid_: Search resource, grain

**Performance interval**:
The account-local time bucket of each Performance point: hour, day, or month. Hourly point boundaries are instants so repeated or missing local hours remain unambiguous across daylight-saving transitions.
_Avoid_: Browser-local interval, display grouping

**Performance series**:
The totals and ordered zero-filled points returned atomically by Performance. Atomic response completeness is distinct from Performance coverage, which describes the underlying archive evidence.
_Avoid_: Search page, cursor traversal, `complete` flag

**Performance coverage**:
A conservative account-local date assessment derived from report dataset metadata. A date is complete only when its daily report completed without parse errors; pending, failed, or partially parsed dates are reported as issues, and dates without retained metadata are unknown rather than assumed missing or complete. Completed daily metadata is retained beyond Amazon's report retrieval window as durable coverage evidence.
_Avoid_: Inferring coverage from performance rows, assuming absent rows mean missing data

**Performance archive**:
BidBeacon's canonical Target-grain advertising observations. Search regroups the same observations through Campaign, Ad-group, Ad, Target, or advertised-ASIN topology; Amazon report shapes never select the public query grain.
_Avoid_: Product archive, report-specific Search mode

**Search filter**:
A structured field, operator, and value constraint applied by Search. All filters must match; the `in` operator expresses alternative values for one field.
_Avoid_: Where clause, condition string

**Default field set**:
The stable, documented resource, ancestor identity, and standard performance fields returned when a Search omits `fields`. Supplying `fields` replaces the default field set rather than extending it.
_Avoid_: All fields

**Default date range**:
The last seven account-local dates, including the current date, used by a Metric Search when no date range is requested. Search responses identify both the resolved dates and that the range was defaulted.
_Avoid_: Selected date range, implicit date range

**Standard performance metrics**:
Impressions, clicks, spend, orders, sales, ACOS, CPC, CTR, ROAS, and CVR. These metrics form the performance portion of each performance-bearing resource's Default field set and the selectable metric vocabulary for Performance.

**Order**:
An attributed customer order reported by Amazon Ads. The public Field is `metrics.orders`; Amazon source fields and internal storage may call the same measure a purchase.
_Avoid_: Purchase

**CVR**:
Orders divided by clicks. The public Field is `metrics.cvr`, and it is part of the Default field set.
_Avoid_: Conversion rate, `metrics.conversionRate`

**Performance metric units**:
ACOS, CTR, and CVR are numeric percentage points, such as `24.45`; ROAS is a numeric multiplier, such as `4.09`. Spend, sales, and CPC use the Advertiser account's currency. Impressions, clicks, and orders are integer counts.
_Avoid_: Fractional percentages, formatted currency strings

**BidBeacon MCP instructions**:
A compact server-level hint containing only universal operating invariants, including explicit Account IDs, stateless requests, Search defaults, and inspect-before-mutate behavior. Correct tool use never depends on a client applying these instructions.
_Avoid_: Workflow manual, field catalog

**BidBeacon Amazon Ads skill**:
An optional Agent Skill bundled alongside the independently usable MCP. It teaches higher-level workflows such as performance diagnosis, Product-to-Ad drill-down, comparison periods, coverage interpretation, and safe optimization sequencing; compatible agent hosts install or reference it separately.
_Avoid_: Required MCP runtime dependency, duplicating tool schemas

**Update operation**:
One explicit patch-style public operation per controllable resource: `update_campaign`, `update_ad_group`, `update_ad`, and `update_target`. Every call requires Account ID and resource ID, accepts only that resource's small supported change set, and uses absolute desired values. State changes replace pause, resume, archive, and delete verbs.
_Avoid_: Generic mutate operation, relative bid adjustment, dedicated pause operation

**Sponsored Products campaign creation**:
The preferred deep creation operation, `create_sponsored_products_campaign`, which accepts a complete campaign, ad-group, advertised-ASIN, and targeting specification and synchronously orchestrates the underlying resources in one call. Its required `state` is `ENABLED` or `PAUSED`, using the same public field and values as other advertising resources. BidBeacon creates the campaign paused, creates every child enabled, and applies the requested campaign state only after all required children succeed; the campaign is the sole delivery gate. On partial failure it preserves every successful resource under the paused campaign and returns a model-visible tool execution error containing the IDs and failure details needed for agent repair or cleanup; the rare case does not add a partial variant to the ordinary success schema. Interactive approval belongs to the MCP host around this consequential call rather than a required prepare/create or create/enable handshake.
_Avoid_: `initialState`, boolean `enabled`, background creation, automatic rollback, agent-supplied idempotency key, requiring agents to assemble or approve an ordinary campaign through sequential calls

**Creation result**:
The canonical BidBeacon representations of the resources created by a mutation. Composite campaign creation returns the campaign, ad group, ads, and targets with their accepted state and controllable fields, using the same compact resource vocabulary as Search and updates. This confirms the consequential configuration and supplies identifiers for later work without exposing full Amazon records or unrelated reporting data.
_Avoid_: Identifier-only composite result, custom confirmation shape, full Amazon entity response

**Targeting mode**:
The explicit Sponsored Products creation choice among `AUTO`, `MANUAL_KEYWORD`, and `MANUAL_PRODUCT`, exposed in Search as `campaign.targetingMode`. One composite campaign creates one initial ad group with one targeting mode; keyword and product targets are not mixed. Separate strategies use separate campaigns or ad groups.
_Avoid_: Inferring targeting mode from omitted targets, combining targeting methods in one initial ad group

**Product target**:
An individual ASIN selected by a manual product-targeting campaign. BidBeacon's initial public creation surface does not expose Amazon category, brand, price, rating, or other refinement expressions.
_Avoid_: Category target, product-refinement expression

**Negative target**:
An ad-group-scoped negative keyword or negative ASIN represented as a Target with `negative = true`. BidBeacon creates these through `create_negative_keyword` and `create_negative_product_target` and archives them through `update_target`. Search still reports campaign-level negatives already present in Amazon, but the initial public surface does not create them.
_Avoid_: Campaign-level negative creation, dedicated remove operation, hiding existing Amazon negatives

**Automatic target bid**:
An optional bid override for one of Amazon's four automatic Sponsored Products target groups: close match, loose match, substitutes, or complements. An omitted override inherits the ad group's required Default bid.
_Avoid_: Requiring four redundant bids, unstated fallback behavior

**Placement bid adjustment**:
A campaign-level percentage-point bid increase for top of search, rest of search, product pages, or Amazon Business. Composite creation accepts optional adjustments, and `update_campaign` patches them later; omitted placements remain unchanged and `0` removes an adjustment.
_Avoid_: Dedicated placement mutation, relative adjustment command

**Bid strategy**:
The campaign bidding behavior exposed as `FIXED`, `DYNAMIC_DOWN_ONLY`, or `DYNAMIC_UP_AND_DOWN`, matching Amazon's advertiser-facing dashboard language. BidBeacon maps Amazon API transport enums internally.
_Avoid_: `MANUAL`, `SALES_DOWN_ONLY`, `SALES_UP_AND_DOWN`

**Daily budget**:
The Sponsored Products campaign's advertiser-facing daily budget, exposed consistently as `campaign.dailyBudget` in Search and `dailyBudget` in creation and update changes.
_Avoid_: `budgetAmount`, `campaign.budget.amount`, budget type, budget period

**Primitive creation operation**:
One explicit low-level operation for each constructible resource or target kind: `create_campaign`, `create_ad_group`, `create_ad`, `create_keyword_target`, and `create_product_target`. Each requires `state: ENABLED | PAUSED`; `ARCHIVED` applies only to existing resources. These are escape hatches for bespoke topology, extending existing campaigns, and workflow recovery rather than the default launch path.
_Avoid_: Hidden creation-state defaults, hiding underlying construction capabilities, generic create operation

**Field**:
A stable BidBeacon-owned attribute or metric that can be selected, filtered, or sorted by Search. BidBeacon exposes a deliberately small field catalog directly in the Search schema; Amazon report names and versions are source mappings rather than public Field names.
_Avoid_: Amazon report column

**Search row**:
A flat mapping from each selected Field name to its value at the Search resource's grain.
_Avoid_: Nested resource object

**Search cursor**:
An opaque, query-bound continuation token that resumes Search after the last returned row using deterministic keyset ordering.
_Avoid_: Page number, offset

**Search page**:
A bounded Search response containing at most the requested `limit` of rows and an optional next cursor. Search defaults to 20 rows and accepts an explicit limit up to 200; exhaustive CLI workflows follow cursors with `--all`.
_Avoid_: Unbounded result, implicit full export

**Search ordering**:
The ordered Fields and directions that determine Search row order and cursor position. Metric Search defaults to spend descending and state-only results to name ascending; resource ID is always the final tie-breaker.
_Avoid_: Database order

**Advertising resource**:
An account-owned campaign, ad group, ad, target, or change event that can be read through Search.
_Avoid_: Entity

**Change event**:
One archived change to a controllable advertising resource, exposed through Search at the change-event grain.
_Avoid_: History record, audit row

**Ad**:
A controllable advertising resource that promotes a product within an ad group. Its promoted ASIN is an attribute of the Ad rather than a substitute resource name.
_Avoid_: Advertised product, product ad

**Product**:
A read-only Search resource with one performance row per advertised ASIN aggregated across the account's ads. `product.asin` is the drill-down key: filtering an Ad Search by the same `ad.asin` returns the controllable ads and their ad-group and campaign ancestry. Product rows do not embed child ID arrays or decorative relationship counts.
_Avoid_: Treating a Product as an Ad, embedded ad IDs

**ASIN**:
Amazon's identifier for a catalog product. In BidBeacon it anchors Merch-oriented searches and workflows across the ads that promote that product.
_Avoid_: Ad ID

**Advertiser account**:
One marketplace-specific Amazon advertising profile whose resources and archived performance are managed together by BidBeacon.
_Avoid_: User account, Amazon account

**Account ID**:
BidBeacon's opaque identifier for one Advertiser account. Amazon account, profile, and marketplace identifiers are attributes of that account rather than substitutes for its Account ID.
_Avoid_: Amazon ads account ID, profile ID
