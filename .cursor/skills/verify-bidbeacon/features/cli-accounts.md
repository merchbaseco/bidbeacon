# CLI accounts

CLI accounts lists advertiser accounts with the `bb` command. The helper sends the local dev key `ak_dev_bidbeacon_local`.

## Sub-features

- `cli-list` runs `bb advertiser-accounts list` against the local API.
- `cli-refuse-write` refuses `bb create` and `bb update` before the CLI starts.

## How to get to it (user POV)

- Run `bb advertiser-accounts list` with `MERCHBASE_API_KEY` set to a suite key for the dev sign-in user.
- Run `bb auth status` to see whether a key is configured.

## Driving it with control-bidbeacon

Preconditions:

- Doctor reports `"amazonAds": "fake"` and the local API base URL.
- The helper sets `MERCHBASE_API_KEY` to `ak_dev_bidbeacon_local` and points `BB_STORAGE_DIR` at an empty directory inside the run.

- **List accounts.** Run `.cursor/skills/verify-bidbeacon/control-bidbeacon cli -- advertiser-accounts list`. Exit 0 and stdout include `Cedar & Coil (dev seed)`. The captured output is `cli/advertiser-accounts.txt`.
- **Proof.** `cli/advertiser-accounts.txt` contains the exit code and the account name.

## Gotchas

- The dev key is refused when `NODE_ENV` or `VARLOCK_ENV` is production. `cli-list` then fails with `AUTHENTICATION_REQUIRED`.
- A passing HTTP `list_advertiser_accounts` does not verify `bb`.
- `bb create` and `bb update` are sent only when doctor reports `"amazonAds": "fake"`. On an adopted live server the helper exits 2 before the CLI starts.
