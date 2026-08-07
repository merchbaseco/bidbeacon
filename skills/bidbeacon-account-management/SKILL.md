---
name: bidbeacon-account-management
description: Guide high-level BidBeacon account discovery, Campaign and Product diagnosis, comparison, optimization, Sponsored Products launch, and recovery workflows. Use when a user asks to analyze or change a BidBeacon Advertiser account through the BidBeacon MCP.
---

# BidBeacon account management

Use this optional skill to coordinate multi-call account workflows. The BidBeacon MCP remains self-sufficient: its tool schemas, validation errors, server instructions, and canonical outputs are the authority for correct calls, even when this skill is not installed.

Keep this skill at the workflow layer. Choose the account, Search resource, Fields, dates, comparison, and mutation sequence; let the MCP define exact input schemas and validation. Do not invent aliases, copy operation schemas, or reproduce the Field catalog.

## Trigger and progressive disclosure

Use the workflow below for every account-management request. Read only the reference that matches the active branch:

- Read [performance diagnosis](references/diagnosis.md) for Campaign or Product analysis, ASIN drill-downs, comparison periods, and coverage-aware conclusions.
- Read [optimization and launch](references/optimization-and-launch.md) before an optimization write or a normal campaign launch.
- Read [partial-failure recovery](references/partial-failure-recovery.md) only after `create_sponsored_products_campaign` returns `COMPOSITE_PARTIAL_FAILURE`.

## Route every workflow explicitly

1. Call `list_advertiser_accounts` first when the Account ID is unknown. Choose the intended marketplace-specific Advertiser account using its returned descriptive metadata.
2. Treat the returned opaque `id` as the only valid BidBeacon Advertiser Account UUID. Pass it as `accountId` on every scoped `search`, creation, and update call. Never substitute an Amazon Ads account ID, profile ID, marketplace ID, dashboard selection, or local default.
3. Keep the selected account's timezone and currency beside the workflow. Interpret every `YYYY-MM-DD` date and hour as account-local, and interpret spend, sales, and bids in the account currency.
4. If more than one account matches the user's description, ask which Account ID to use before reading or writing account data.

## Choose the workflow branch

- Diagnose Campaign or Product performance: read [performance diagnosis](references/diagnosis.md), then use `search` with explicit dates and only the compatible curated Fields needed for the question.
- Optimize an existing Campaign, Ad group, Ad, or Target: read [optimization and launch](references/optimization-and-launch.md), inspect before writing, and submit absolute desired values through the matching `update_*` tool.
- Launch an ordinary Sponsored Products campaign: read [optimization and launch](references/optimization-and-launch.md), prefer `create_sponsored_products_campaign`, and obtain host approval around that consequential call.
- Build bespoke topology, extend an existing Campaign, or repair a partial launch: use the primitive operations described in the launch reference; read the recovery reference for a disclosed partial-failure error.

## Close the loop

Report the Account ID, account-local date range, Search coverage status when performance was used, and the canonical result or structured error. Treat `COMPLETE`, `INCOMPLETE`, and `UNKNOWN` coverage as different evidence levels; never turn missing coverage into zero performance.
