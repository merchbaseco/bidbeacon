# MCP accounts

MCP accounts lists the advertiser accounts the signed-in user can use, through `POST /mcp` and the tool `list_advertiser_accounts`.

## Sub-features

- `mcp-list` calls `list_advertiser_accounts` on the running HTTP server.
- `mcp-refuse-write` refuses `create_*` and `update_*` before a request is sent.

## How to get to it (user POV)

- Send an MCP `tools/call` to `http://127.0.0.1:<api-port>/mcp` with a Clerk OAuth bearer.
- The dashboard session is a different credential. The tool still has to be attempted with the credential this run can mint.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports `"ok": true`.
- `browser token` has written the Clerk session JWT.

- **List accounts.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon mcp call list_advertiser_accounts --input '{}' --expect "Cedar & Coil (dev seed)" --path mcp/list_advertiser_accounts.json`. A pass is a tool result whose text includes `Cedar & Coil (dev seed)` and `5eed0000-0000-4000-8000-000000000001`.
- **Refuse a write.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon mcp call create_campaign --input '{}'`. Exit code is `2`. Stderr names `create_campaign` and says the call was refused. No request is sent.
- **Proof.** Save `mcp/list_advertiser_accounts.json`. The current failure is exit 1 and a body that contains `Unauthorized`. That is a failed `mcp-list`, not a pass.

## Gotchas

- `/mcp` authorizes with `oauthAccess` only. A session JWT from dev sign-in is not an OAuth token. `ak_` keys are rejected in `authenticateMcpRequest` before any lookup.
- The cloud environment has no Clerk OAuth token to substitute. Leave the 401 as a failed entry.
- `src/mcp/server.integration-check.ts` does not open port `8090`. Do not cite it as this feature.
- Do not retry the call against `https://bidbeacon.merchbase.co/mcp`.
