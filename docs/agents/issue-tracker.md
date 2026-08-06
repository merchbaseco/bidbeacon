# Issue tracker: Linear

Issues and specs for this repository live in the Knickerbocker Ventures Linear workspace.

## Routing

- Team: Products (`PRD`)
- Product label: `BidBeacon`
- CLI: `linear`
- Issue identifiers: `PRD-<number>`

Every BidBeacon issue carries the `BidBeacon` label.

## Publishing

When a skill says to publish an issue, create it under `PRD` with a Markdown description file and non-interactive execution.

A completed specification also carries the `ready-for-agent` label.

## Specs and implementation tickets

- `/to-spec` creates one parent specification issue.
- `/to-tickets` creates implementation issues as children of that specification.
- Each implementation issue is independently executable and carries `BidBeacon` and `ready-for-agent`.
- Dependencies use Linear's native `blocked-by` and `blocks` relations.
- Tickets whose blocking relations are resolved may be implemented in parallel.

## Reading and updating

Use the Linear CLI's dedicated issue commands. Preserve existing labels when updating an issue because `linear issue update --label` replaces the complete label set.
