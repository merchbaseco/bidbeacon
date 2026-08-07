# Optimization and ordinary launch

## Inspect before mutate

1. Resolve and state the explicit Account ID.
2. Search the target resource's current settings before changing it. Include the resource ID, state, delivery status, and the control being considered; include Campaign or Ad-group ancestry when the resource is an Ad or Target.
3. Search relevant performance over an explicit account-local date range. Read coverage and keep the date grain aligned with the decision. If the archive is incomplete or unknown, disclose that uncertainty and avoid presenting the recommendation as settled.
4. For a relative request such as “raise the bid by 10%,” use the inspected value to calculate an absolute desired value. Submit that replacement through exactly one matching update operation: `update_campaign`, `update_ad_group`, `update_ad`, or `update_target`.
5. Re-read or use the canonical mutation result to report the accepted state and control. Wait for the MCP result; do not describe an update as background work.

Updates are patch-style and absolute. Omitted changes remain unchanged. Use `ENABLED`, `PAUSED`, or `ARCHIVED` only where the current tool schema permits them; `ARCHIVED` is terminal. Use public names such as `dailyBudget`, `bidStrategy`, `defaultBid`, `bid`, and `placementBidAdjustments`, not Amazon transport names or legacy pause/resume/delete aliases. Treat consequential writes as host-approved actions.

## Ordinary Sponsored Products launch

Prefer `create_sponsored_products_campaign` for a normal end-to-end launch. Before calling it, confirm the Account ID, Campaign name, daily budget, bid strategy, account-local start date, advertised ASINs, one targeting mode, and any negatives. The composite operation supports `AUTO`, `MANUAL_KEYWORD`, or `MANUAL_PRODUCT`; keep keyword and product targeting separate. Product targeting uses individual ASINs, not category or refinement expressions.

The requested Campaign `state` is the delivery decision. `PAUSED` creates a complete topology without beginning spend; `ENABLED` launches after the child resources succeed. The composite operation validates the complete request, runs synchronously, waits for Amazon responses and normal retries, and returns canonical Campaign, Ad group, Ad, and Target representations. It does not require a prepare token, background job, client idempotency key, or separate enable step.

Get the MCP host's approval at the consequential composite call. Do not turn approval into extra server ceremony or assemble an ordinary launch through primitive calls merely to imitate the composite.

## Bespoke topology and recovery primitives

Use primitives when extending an existing Campaign, creating a deliberate non-standard topology, or repairing a disclosed partial result: `create_campaign`, `create_ad_group`, `create_ad`, `create_keyword_target`, `create_product_target`, `create_negative_keyword`, and `create_negative_product_target`. Carry forward every canonical ID returned by the previous successful call, pass the same explicit Account ID, and provide an explicit creation state. Search the current topology before repairing rather than assuming a missing child.

Use `update_target` to archive an existing negative Target by ID. Do not invent campaign-level negative creation, generic mutation tools, relative bid operations, or compatibility aliases.
