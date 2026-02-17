# BidBeacon CLI (bb)

Use this skill when you need to drive BidBeacon via CLI for automation, debugging, or data access.

## Scope

This skill covers:
- Authentication via API keys.
- Default account selection behavior.
- Common `bb` commands and flags.
- Safe usage patterns (do not leak keys).

## Prerequisites

- API server running (local dev: `bun run dev`).
- API key generated from the dashboard More menu: `Get API key`.
- Install globally: `npm install -g @bidbeacon/cli`.
- Use command `bb`.

## Auth & Config

The CLI looks for credentials in this order:
- `--api-key` flag
- `BIDBEACON_API_KEY` env var
- `~/.bidbeacon/config.json` (`apiKey`)

Other config values:
- `--base-url` or `BIDBEACON_API_BASE_URL` or `config.baseUrl` (default `http://localhost:8080`)
- `--account` or `BIDBEACON_ACCOUNT_ID` or `config.accountId`

Config commands:
```bash
bb config show
bb config set api-key <value>
bb config set base-url <url>
bb config set account <adsAccountId>
```

## Default Account Behavior

If `--account` is not provided:
1. Uses the dashboard-selected account from `api.users.getSelectedAccount`.
2. Falls back to the first accessible account from `api.accounts.list`.
3. Errors if no accessible account exists.

## Core Commands

```bash
bb accounts list

bb reports summary --account <adsAccountId>
  --country <US|CA|...>
  --aggregation <daily|hourly>
  --entity-type <target|product>
  --status <...>
  --from <YYYY-MM-DD>
  --to <YYYY-MM-DD>
  --limit <n>
  --offset <n>

bb ads campaigns list --account <adsAccountId>
  --country <US|CA|...>
  --limit <n>
  --cursor <cursor>
```

Common flags:
- `--json` (raw JSON output)
- `--api-key <key>`
- `--base-url <url>`
- `--account <adsAccountId>`

## Examples

```bash
# Use env var, list accounts
BIDBEACON_API_KEY=bbk_... bb accounts list

# Reports summary using dashboard default account
BIDBEACON_API_KEY=bbk_... bb reports summary --country US --aggregation daily

# Campaign list with explicit account
bb ads campaigns list --account amzn1.ads-account.g.xyz --country US
```

## Safety & Best Practices

- Do not paste API keys into logs or tickets.
- Prefer env vars over in-repo config files.
- Use `--json` for machine-readable output.
- If a command errors with `UNAUTHORIZED`, re-generate a key (keys are one-time display).

## Troubleshooting

- If the CLI cannot connect, confirm `base-url` and that the API server is running.
- If account access fails, verify the API key was created with the correct account scopes.
- If the dashboard selection is missing, set a default with:
  `bb config set account <adsAccountId>`
