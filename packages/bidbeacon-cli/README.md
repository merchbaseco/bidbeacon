# @bidbeacon/cli

BidBeacon command-line interface.

## Install

```bash
npm install -g @bidbeacon/cli
```

## Usage

```bash
bb --help
bb config set api-key <bbk_...>
bb accounts list
bb campaigns search lepricorn
bb asins tree B07NXRP1B8 --depth ad-group
bb asins overview B07NXRP1B8 --range 14d --metrics spend,sales,acos
bb metrics table targets --asin B07NXRP1B8 --range 14d --sort acos --direction desc --limit 25
```
