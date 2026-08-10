---
name: bidbeacon-amazon-ads
description: "Manage Amazon Ads with BidBeacon: audit performance, investigate Campaigns or ASINs, optimize resources, launch Sponsored Products ads, manage negatives or lifecycle, recover partial launches, or maintain these recipes."
---

# Manage Amazon Ads with BidBeacon

Use one recipe. Tool schemas own validation; this skill owns judgment.

## Invariants

1. Resolve the marketplace-specific Advertiser Account UUID when unknown or ambiguous. Pass it on every scoped call.
2. Use account-local dates, currency, comparable ranges, and coverage. Search resources; use Performance for temporal measurements.
3. Inspect before writing. Show the exact proposed outcome, obtain approval at the consequential call, await it, and verify accepted state; read back when delivery or multiple writes matter.
4. Treat the Campaign as the spend gate. Create paused unless enabled delivery is explicit.
5. Join evidence by marketplace and ASIN: BidBeacon owns ad attribution, MerchBase actual sales and royalties, and RankWrangler external demand.
6. Use Search defaults normally. Lead with names and ASINs; label IDs as follow-up handles.

## Recipes

- Account audit or opportunity discovery: [account review](references/account-review.md)
- ASIN performance or topology: [Product investigation](references/investigate-product.md)
- Campaign performance or change: [Campaign investigation](references/investigate-campaign.md)
- Recommendation or authorized control change: [optimization](references/optimize-resource.md)
- Sponsored Products ad launch: [Campaign launch](references/launch-campaign.md)
- Negative keyword or ASIN changes: [negative targeting](references/manage-negatives.md)
- Reactivation, pause, or permanent cleanup: [lifecycle](references/pause-or-archive.md)
- `COMPOSITE_PARTIAL_FAILURE`: [recovery](references/recover-partial-launch.md)
- Explicit recipe-maintenance request: [add a recipe](references/add-recipe.md)

Read only the selected recipe; follow a linked recipe only when that recipe branches.

Finish with evidence, result, identifiers, and relevant uncertainty.
