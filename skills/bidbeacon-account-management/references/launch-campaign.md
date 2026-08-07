# Recipe: launch a Sponsored Products Campaign

Use the composite for an ordinary automatic, manual-keyword, or manual-ASIN launch.

1. Confirm the Account, budget, advertised ASINs, one targeting mode, bids, negatives, and delivery intent.
2. Create paused unless enabled delivery is explicit.
3. Invoke `create_sponsored_products_campaign` at approval and await its synchronous result.
4. Report the accepted Campaign, Ad-group, Ad, and Target IDs and whether spend is enabled.
5. On `COMPOSITE_PARTIAL_FAILURE`, switch to [recovery](recover-partial-launch.md); never retry the composite.

Use primitives only for deliberate custom topology, extending an existing Campaign, or recovery. Keep keyword and Product targeting in separate ordinary Campaigns.

## Done

Report requested versus accepted state, all created IDs, and whether the Campaign can spend.
