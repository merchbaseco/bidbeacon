# CLI accounts

CLI accounts lists advertiser accounts with the `bb` command. The cloud VM has no suite API key, so this entry fails closed until one is provided.

## Sub-features

- `cli-list` runs `bb advertiser-accounts list` against the local API.
- `cli-refuse-write` refuses `bb create` and `bb update` before the CLI starts.

## How to get to it (user POV)

- Run `bb advertiser-accounts list` with `MERCHBASE_API_KEY` set to a suite key for the dev sign-in user.
- Run `bb auth status` to see whether a key is configured.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports the local API base URL.
- `MERCHBASE_API_KEY` is unset in the `cli` child. The helper also points `BB_STORAGE_DIR` at an empty directory inside the run.

- **List accounts.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon cli -- advertiser-accounts list`. Exit 0 and stdout include `Cedar & Coil (dev seed)`. The captured output is `cli/advertiser-accounts.txt`.
- **Refuse a write.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon cli -- create`. Exit code is `2` and stderr says the Amazon write was refused.
- **Proof.** `cli/advertiser-accounts.txt` contains the exit code and the command output. A missing-key error is a failed `cli-list`, not a pass.

## Gotchas

- The Development vault schema does not include a suite API key. Expect `cli-list` to fail until someone provides `MERCHBASE_API_KEY` for `mbu_0ae4691c2dff45559d559bea99cd621b`.
- Passing the dashboard session JWT as `MERCHBASE_API_KEY` does not work. The CLI sends that value down the API-key path, and keys start with `ak_`.
- HTTP `list_advertiser_accounts` is a different entry, on [MCP accounts](./mcp-accounts.md) and the dashboard session. A passing HTTP call does not verify `bb`.
- `bb create` and `bb update` call Amazon even when a key exists. The helper refuses them.
