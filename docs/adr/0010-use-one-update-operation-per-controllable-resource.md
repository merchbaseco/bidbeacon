---
summary: Records why each controllable resource has one absolute patch-style update operation.
read_when:
  - changing campaign, ad-group, ad, target, bid, budget, placement, or state mutations
---

# Use one update operation per controllable resource

BidBeacon exposes four patch-style update operations: `update_campaign`, `update_ad_group`, `update_ad`, and `update_target`. Each requires an explicit Account ID and resource ID and accepts a resource-specific `changes` object:

- Campaign: `state`, `dailyBudget`, `bidStrategy`, `placementBidAdjustments`
- Ad group: `state`, `defaultBid`
- Ad: `state`
- Target: `state`, `bid`

Separate pause, resume, archive, delete, set-budget, set-bid, and adjust-bid operations were rejected because they multiply equivalent paths and make tool selection less predictable. A generic cross-resource mutation was rejected because its schema and validation would be less legible. Mutations use absolute desired values; an agent that wants a relative change first reads the current value, calculates the result, and submits the explicit replacement.

`placementBidAdjustments` is a patch object with optional `topOfSearch`, `restOfSearch`, `productPages`, and `amazonBusiness` percentage-point increases. An omitted placement remains unchanged; `0` removes its adjustment.
