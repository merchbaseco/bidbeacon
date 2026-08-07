---
summary: Records why workflow guidance ships as an optional skill beside a self-sufficient MCP.
read_when:
  - changing MCP instructions, tool descriptions, prompts, or bundled agent skills
---

# Bundle an optional account management skill

BidBeacon ships a self-sufficient MCP plus an optional `bidbeacon-account-management` Agent Skill in the same distribution. Tool names, schemas, validation errors, and compact server instructions are sufficient for correct primitive calls without the skill. The skill is a compact intent router over progressively disclosed, job-shaped recipes. Recipes carry only durable judgment, branching, and completion bounds for account review, Campaign or ASIN investigation, optimization, launch, negative targeting, lifecycle changes, partial-failure recovery, and explicit user-requested skill extension.

Generic reference chapters were rejected because they force the agent to translate a concrete user job into internal categories and compose the actual workflow itself. Recipe files instead match recognizable requests and load only the active branch. Universal account-routing, timezone, coverage, approval, verification, and spend-gate invariants stay in `SKILL.md`; exact schemas, defaults, and Field compatibility remain authoritative in the MCP. Worked request bodies and exhaustive procedures are omitted so the agent can use current tool schemas and task context rather than a stale cached contract.

Supporting evidence joins by marketplace and ASIN. BidBeacon owns ad attribution and writes, MerchBase owns actual sales and royalties, and RankWrangler supplies external demand only when ad and seller evidence leave a material question unresolved.

Embedding the full recipe collection in every tool description was rejected because it would consume context on every conversation and repeat concerns across tools. Relying on the skill for tool correctness was also rejected because Agent Skills are installed by compatible hosts rather than transported automatically by the MCP protocol. MCP prompts may later support explicitly invoked workflows, but they are not the primary autonomous guidance layer.
