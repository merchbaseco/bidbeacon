# Composite partial-failure recovery

Read this reference only when `create_sponsored_products_campaign` returns `COMPOSITE_PARTIAL_FAILURE`.

The operation is synchronous and stops at the failed child. The disclosed Campaign remains `PAUSED`, and the error identifies the Campaign, every successful Ad group, Ad, and Target, the failed primitive input, and useful sanitized Amazon error details. Treat those IDs as real resources; do not assume rollback, deletion, or a background retry occurred.

## Recovery sequence

1. Preserve the explicit Account ID and record the paused Campaign ID plus every successful resource ID from the error details. Keep the failed operation and sanitized Amazon message for the repair decision.
2. Search the Campaign and its known topology before taking another write. Confirm the current states and identify whether the failed child is absent, present, or partially accepted. Never blindly retry the whole composite, because that can create duplicate resources.
3. Repair only the failed or missing branch with the matching primitive: `create_ad_group`, `create_ad`, `create_keyword_target`, `create_product_target`, `create_negative_keyword`, or `create_negative_product_target`. Use `create_campaign` only when the recovery explicitly needs a new Campaign. Pass explicit states and retain each newly returned canonical ID.
4. Keep the Campaign paused while the topology is incomplete. After the intended Campaign, Ad group, Ads, and Targets are present and inspected, use `update_campaign` with an explicit desired state only after host approval. The Campaign is the delivery gate; do not separately enable children to launch spend.
5. If repair is not wanted, clean up deliberately with the matching update operations and terminal `ARCHIVED` states after inspection. Report what was archived and what remains; never claim an atomic rollback.

If the error lacks usable partial details, stop making topology assumptions. Search by the explicit Account ID and any known IDs, report the uncertainty, and ask for direction before creating more resources. Do not convert a partial failure into a successful ordinary-launch claim.
