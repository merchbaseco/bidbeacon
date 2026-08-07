# Recipe: recover a partial Campaign launch

Use only after `create_sponsored_products_campaign` returns `COMPOSITE_PARTIAL_FAILURE`.

1. Preserve the returned paused Campaign and every successful child ID.
2. Search the known topology; determine whether the failed child is absent, present, or uncertain.
3. Repair only the missing branch with its primitive. Never retry the composite.
4. Keep the Campaign paused until topology is complete. Then either enable with approval or deliberately clean up through [lifecycle](pause-or-archive.md).
5. When details are insufficient, stop and request direction.

## Done

Report the original failure, verified topology, repaired or archived IDs, Campaign state, any unresolved resource, and whether spend remains gated.
