# MCP accounts

MCP accounts lists the advertiser accounts the signed-in user can use, through `POST /mcp` and the tool `list_advertiser_accounts`.

## Sub-features

- `mcp-list` calls `list_advertiser_accounts` on the running HTTP server with the local dev key.

## How to get to it (user POV)

- Send an MCP `tools/call` to `http://127.0.0.1:<api-port>/mcp` with `Authorization: Bearer ak_dev_bidbeacon_local`.
- A Clerk OAuth bearer still works. The helper uses the dev key.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports `"ok": true` and `"amazonAds": "fake"`.

- **List accounts.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon mcp call list_advertiser_accounts --input '{}' --expect "Cedar & Coil (dev seed)" --path mcp/list_advertiser_accounts.json`. The helper sends `ak_dev_bidbeacon_local`. A pass includes `Cedar & Coil (dev seed)` and `5eed0000-0000-4000-8000-000000000001`.
- **Proof.** Save `mcp/list_advertiser_accounts.json`. `Unauthorized` means this server is not the one launch started, or `NODE_ENV` or `VARLOCK_ENV` is production.

## Gotchas

- `/mcp` still rejects every `ak_` key except `ak_dev_bidbeacon_local`. That key is refused when `NODE_ENV` or `VARLOCK_ENV` is production.
- `src/mcp/server.integration-check.ts` does not open the launched port. Do not cite it as this feature.
- Do not retry the call against `https://bidbeacon.merchbase.co/mcp`.
