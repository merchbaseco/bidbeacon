# Recipe: change resource lifecycle

1. Inspect exact resources. Include every lifecycle state and follow pagination when completeness matters.
2. For reactivation, use relevant history, propose conservative controls, enable at approval, verify delivery state, and set a follow-up window.
3. To stop spend quickly, pause the Campaign.
4. For deliberate cleanup, archive known children before parents: Targets, Ads, Ad groups, Campaign.
5. Confirm each accepted state. Continue after a failure only when the remaining action is still safe.

`PAUSED` is reversible; `ARCHIVED` is terminal. A parent's state does not prove every child was reconciled.

## Done

Report every requested resource ID, accepted state, failed action, and whether any known resource can still deliver.
