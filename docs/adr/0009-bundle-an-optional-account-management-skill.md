---
summary: Records why workflow guidance ships as an optional skill beside a self-sufficient MCP.
read_when:
  - changing MCP instructions, tool descriptions, prompts, or bundled agent skills
---

# Bundle an optional account management skill

BidBeacon ships a self-sufficient MCP plus an optional `bidbeacon-account-management` Agent Skill in the same distribution. Tool names, schemas, validation errors, and compact server instructions are sufficient for correct primitive calls without the skill. The skill adds progressively disclosed workflows for performance diagnosis, Product-to-Ad traversal, comparison periods, coverage interpretation, and safe optimization sequencing.

Embedding the full workflow manual in every tool description was rejected because it would consume context on every conversation and repeat concerns across tools. Relying on the skill for tool correctness was also rejected because Agent Skills are installed by compatible hosts rather than transported automatically by the MCP protocol. MCP prompts may later support explicitly invoked workflows, but they are not the primary autonomous guidance layer.
