---
summary: Remote stateless MCP transport, Clerk OAuth contract, tool inventory, and deployment checks.
read_when:
  - implementing or reviewing BidBeacon's remote MCP endpoint
  - deploying or integrating an MCP client with BidBeacon
---

# Remote MCP

BidBeacon exposes a remote, stateless MCP server at `https://bidbeacon.merchbase.co/mcp`.
The endpoint uses the official TypeScript MCP SDK's Streamable HTTP transport. It is mounted in the existing Fastify API server and does not open a separate port or require a local Postgres service.

## Authentication

MCP requests require a Clerk OAuth bearer token on every request. OAuth discovery metadata is available at both the root and path-specific well-known URLs:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-authorization-server`
- `/.well-known/oauth-authorization-server/mcp`

API keys are not accepted by `/mcp`. Each authenticated request resolves a fresh stable Merchbase User and its accessible BidBeacon Advertiser Account UUIDs. Every tool call except `list_advertiser_accounts` must include an explicit `accountId`; selected dashboard account state is never consulted.

Set `MCP_RESOURCE_URL` to the externally reachable `/mcp` URL when deploying outside the default production host. The value must be an absolute `http` or `https` URL ending in `/mcp`, without query or fragment components.

## Tool contract

The public tool inventory is deliberately limited to the shared operation layer:

`list_advertiser_accounts`, `search`, `performance`, `create_sponsored_products_campaign`, `create_campaign`, `create_ad_group`, `create_ad`, `create_keyword_target`, `create_product_target`, `create_negative_keyword`, `create_negative_product_target`, `update_campaign`, `update_ad_group`, `update_ad`, and `update_target`.

Search returns paginated resource snapshots and range-aggregated resource metrics. Performance returns complete bounded Account or Product time series without cursors. See [the Performance contract](performance-api.md).

The server exposes tools only. It does not expose MCP resources, prompts, sampling, Apps, stdio transport, or selected-account/session state. Input and output JSON Schemas are generated from the operation schemas. Successful calls return the same JSON value as portable text content and `structuredContent`. Operation failures use the stable `{ error: { code, message, details } }` envelope documented in [the CLI contract](cli-spec.md).

## Optional Amazon Ads skill

The public repository exposes the independently installable `bidbeacon-amazon-ads` Agent Skill in the skills.sh-compatible `skills/bidbeacon-amazon-ads` folder. Install it with `npx skills add merchbaseco/bidbeacon --skill bidbeacon-amazon-ads -g`. A production build also copies the same independently readable folder to `dist/skills/bidbeacon-amazon-ads`. Its compact router progressively discloses one recipe for the active job: account review, Campaign or ASIN investigation, optimization, campaign launch, negative targeting, pause/archive, partial-failure recovery, or explicit user-requested skill extension. Recipes contain high-level judgment, branching, and completion bounds without copying MCP schemas or worked request bodies.

The skill is optional. The MCP remains self-sufficient: tool names, generated schemas, validation errors, canonical outputs, and universal server instructions are enough for correct calls when the skill is absent.

## Deployment checks

The reverse proxy must forward `/mcp` and the four discovery paths to the API server, preserving `Authorization`, `Origin`, `Accept`, `Content-Type`, `Mcp-Protocol-Version`, `Mcp-Session-Id`, and `Last-Event-ID` headers. The server is stateless, so do not add sticky-session or in-memory session requirements.

Verify without opening a listening test port:

```bash
bun run test --run src/mcp/auth.test.ts src/mcp/server.test.ts src/mcp/http.test.ts
```

The MCP tests use the SDK's linked in-memory transport and Fastify injection. They do not contact Clerk, Amazon Ads, or a database service.
