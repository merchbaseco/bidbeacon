# @bidbeacon/cli

BidBeacon command-line interface.

## Install

```bash
npm install -g @bidbeacon/cli
```

## Usage

```bash
export BB_API_KEY=<bbk_...>
bb --help
bb config set storage-dir ~/.config/bidbeacon-work
bb accounts list
bb changelog
bb campaigns search lepricorn
bb asins tree B07NXRP1B8 --depth ad-group
bb asins overview B07NXRP1B8 --range 14d --depth ad-group --metrics spend,sales,acos
bb metrics table targets --asin B07NXRP1B8 --range 14d --sort acos --direction desc --limit 25
```

`bb changelog` prints the packaged release notes for the installed CLI version by default. Use `bb changelog --all` to dump the full bundled changelog or `bb changelog v0.2.3` to inspect a specific release.

Authentication uses the `BB_API_KEY` environment variable.

`bb config set storage-dir <path>` persists a custom directory for CLI config/data. After you set it once, future `bb` commands use `<path>/config.json` instead of `~/.bidbeacon/config.json`.

Env overrides also work for the remaining config values and take precedence over saved config:

- `BB_STORAGE_DIR`
- `BB_BASE_URL`
- `BB_ACCOUNT_ID`
- `BB_COUNTRY_CODE`

When no `--range` is passed, the CLI defaults to `7d`.
