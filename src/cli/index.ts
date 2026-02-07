#!/usr/bin/env bun
import { createTRPCProxyClient, httpLink } from '@trpc/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AppRouter } from '../api/router';
import { getTimezoneForCountry } from '../utils/timezones';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_RANGE = 'today';
const CONFIG_DIR = join(homedir(), '.bidbeacon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const main = async () => {
    const { positional, flags } = parseArgs(process.argv.slice(2));

    if (flags.help || positional.length === 0) {
        printHelp();
        return;
    }

    const [command, subcommand, action, ...rest] = positional;

    if (command === 'config') {
        await handleConfigCommand(subcommand, action, rest);
        return;
    }

    const config = await loadConfig();
    const apiConfig = resolveApiConfig(config);
    const client = createTRPCProxyClient<AppRouter>({
        links: [
            httpLink({
                url: `${apiConfig.baseUrl}/api`,
                headers() {
                    return { Authorization: `Bearer ${apiConfig.apiKey}` };
                },
            }),
        ],
    });

    switch (command) {
        case 'accounts': {
            if (subcommand !== 'list') {
                throw new Error('Usage: bb accounts list');
            }
            const data = await client.api.cli.accountsList.query();
            printOutput(data);
            return;
        }
        case 'campaigns': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const data = await client.api.cli.campaignsList.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb campaigns get <campaign_id>');
                const data = await client.api.cli.campaignsGet.query({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [name, budget] = [action, rest[0]];
                if (!name || !budget) throw new Error('Usage: bb campaigns create <name> <budget>');
                const data = await client.api.cli.campaignsCreate.mutate({
                    config: cliConfig,
                    name,
                    budget: parseNumberArg(budget, 'budget'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb campaigns update <campaign_id> --name <name>');
                const name = readFlag(flags, ['name']);
                const portfolioId = readFlag(flags, ['portfolio']);
                const startDateTime = readFlag(flags, ['start']);
                const endDateTime = readFlag(flags, ['end']);
                const data = await client.api.cli.campaignsUpdate.mutate({
                    config: cliConfig,
                    campaignId,
                    name: name ?? undefined,
                    portfolioId: portfolioId ?? undefined,
                    startDateTime: startDateTime ?? undefined,
                    endDateTime: endDateTime ?? undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'pause') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb campaigns pause <campaign_id>');
                const data = await client.api.cli.campaignsPause.mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb campaigns resume <campaign_id>');
                const data = await client.api.cli.campaignsResume.mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb campaigns delete <campaign_id>');
                const data = await client.api.cli.campaignsDelete.mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-budget') {
                const campaignId = action;
                const budget = rest[0];
                if (!campaignId || !budget) throw new Error('Usage: bb campaigns set-budget <campaign_id> <budget>');
                const data = await client.api.cli.campaignsSetBudget.mutate({
                    config: cliConfig,
                    campaignId,
                    budget: parseNumberArg(budget, 'budget'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-bid-strategy') {
                const campaignId = action;
                const strategy = rest[0];
                if (!campaignId || !strategy) {
                    throw new Error('Usage: bb campaigns set-bid-strategy <campaign_id> <strategy>');
                }
                const data = await client.api.cli.campaignsSetBidStrategy.mutate({
                    config: cliConfig,
                    campaignId,
                    strategy,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-bid-adjustments') {
                const campaignId = action;
                const scope = rest[0];
                const json = rest[1];
                if (!campaignId || !scope || !json) {
                    throw new Error('Usage: bb campaigns set-bid-adjustments <campaign_id> <placement|audience|creative> <json>');
                }
                const data = await client.api.cli.campaignsSetBidAdjustments.mutate({
                    config: cliConfig,
                    campaignId,
                    scope,
                    adjustments: parseJsonArg(json),
                });
                printOutput(data);
                return;
            }
            throw new Error('Unknown campaigns command.');
        }
        case 'ad-groups': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const data = await client.api.cli.adGroupsList.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const adGroupId = action;
                if (!adGroupId) throw new Error('Usage: bb ad-groups get <ad_group_id>');
                const data = await client.api.cli.adGroupsGet.query({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [campaignId, name, bid] = [action, rest[0], rest[1]];
                if (!campaignId || !name || !bid) {
                    throw new Error('Usage: bb ad-groups create <campaign_id> <name> <default_bid>');
                }
                const data = await client.api.cli.adGroupsCreate.mutate({
                    config: cliConfig,
                    campaignId,
                    name,
                    defaultBid: parseNumberArg(bid, 'default_bid'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const adGroupId = action;
                const name = rest[0];
                if (!adGroupId || !name) throw new Error('Usage: bb ad-groups update <ad_group_id> <name>');
                const data = await client.api.cli.adGroupsUpdate.mutate({ config: cliConfig, adGroupId, name });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-default-bid') {
                const adGroupId = action;
                const value = rest[0];
                if (!adGroupId || !value) {
                    throw new Error('Usage: bb ad-groups set-default-bid <ad_group_id> <value>');
                }
                const data = await client.api.cli.adGroupsSetDefaultBid.mutate({
                    config: cliConfig,
                    adGroupId,
                    value: parseNumberArg(value, 'value'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'pause') {
                const adGroupId = action;
                if (!adGroupId) throw new Error('Usage: bb ad-groups pause <ad_group_id>');
                const data = await client.api.cli.adGroupsPause.mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const adGroupId = action;
                if (!adGroupId) throw new Error('Usage: bb ad-groups resume <ad_group_id>');
                const data = await client.api.cli.adGroupsResume.mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const adGroupId = action;
                if (!adGroupId) throw new Error('Usage: bb ad-groups delete <ad_group_id>');
                const data = await client.api.cli.adGroupsDelete.mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            throw new Error('Unknown ad-groups command.');
        }
        case 'ads': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const data = await client.api.cli.adsList.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const adId = action;
                if (!adId) throw new Error('Usage: bb ads get <ad_id>');
                const data = await client.api.cli.adsGet.query({ config: cliConfig, adId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [adGroupId, productId] = [action, rest[0]];
                const productIdType = rest[1] ?? 'ASIN';
                if (!adGroupId || !productId) {
                    throw new Error('Usage: bb ads create <ad_group_id> <asin|sku> [ASIN|SKU]');
                }
                const data = await client.api.cli.adsCreate.mutate({
                    config: cliConfig,
                    adGroupId,
                    productIdType,
                    productId,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const adId = action;
                const state = rest[0];
                if (!adId || !state) throw new Error('Usage: bb ads update <ad_id> <state>');
                const data = await client.api.cli.adsUpdate.mutate({ config: cliConfig, adId, state });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const adId = action;
                if (!adId) throw new Error('Usage: bb ads delete <ad_id>');
                const data = await client.api.cli.adsDelete.mutate({ config: cliConfig, adId });
                printOutput(data);
                return;
            }
            throw new Error('Unknown ads command.');
        }
        case 'targets': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const data = await client.api.cli.targetsList.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const targetId = action;
                if (!targetId) throw new Error('Usage: bb targets get <target_id>');
                const data = await client.api.cli.targetsGet.query({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const targetType = action;
                if (!targetType) throw new Error('Usage: bb targets create keyword|product ...');
                if (targetType === 'keyword') {
                    const [adGroupId, keyword, matchType, bid] = rest;
                    if (!adGroupId || !keyword || !matchType || !bid) {
                        throw new Error('Usage: bb targets create keyword <ad_group_id> <keyword> <match_type> <bid>');
                    }
                const data = await client.api.cli.targetsCreateKeyword.mutate({
                    config: cliConfig,
                    adGroupId,
                    keyword,
                    matchType,
                    bid: parseNumberArg(bid, 'bid'),
                });
                    printOutput(data);
                    return;
                }
                if (targetType === 'product') {
                    const [adGroupId, productId, matchType, bid, productIdType] = rest;
                    if (!adGroupId || !productId || !matchType || !bid) {
                        throw new Error('Usage: bb targets create product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU]');
                    }
                    const data = await client.api.cli.targetsCreateProduct.mutate({
                        config: cliConfig,
                        adGroupId,
                        productIdType: productIdType ?? 'ASIN',
                        productId,
                        matchType,
                        bid: parseNumberArg(bid, 'bid'),
                    });
                    printOutput(data);
                    return;
                }
                throw new Error('Unknown targets create type.');
            }
            if (subcommand === 'delete') {
                const targetId = action;
                if (!targetId) throw new Error('Usage: bb targets delete <target_id>');
                const data = await client.api.cli.targetsDelete.mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'pause') {
                const targetId = action;
                if (!targetId) throw new Error('Usage: bb targets pause <target_id>');
                const data = await client.api.cli.targetsPause.mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const targetId = action;
                if (!targetId) throw new Error('Usage: bb targets resume <target_id>');
                const data = await client.api.cli.targetsResume.mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            throw new Error('Unknown targets command.');
        }
        case 'bids': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'set') {
                const targetId = action;
                const value = rest[0];
                if (!targetId || !value) throw new Error('Usage: bb bids set <target_id> <value>');
                const data = await client.api.cli.bidsSet.mutate({
                    config: cliConfig,
                    targetId,
                    value: parseNumberArg(value, 'value'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'adjust') {
                const targetId = action;
                const delta = rest[0];
                if (!targetId || !delta) throw new Error('Usage: bb bids adjust <target_id> <delta>');
                const data = await client.api.cli.bidsAdjust.mutate({
                    config: cliConfig,
                    targetId,
                    delta: parseNumberArg(delta, 'delta'),
                });
                printOutput(data);
                return;
            }
            throw new Error('Unknown bids command.');
        }
        case 'metrics': {
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'campaigns') {
                const data = await client.api.cli.metricsCampaigns.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'ad-groups') {
                const data = await client.api.cli.metricsAdGroups.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'ads') {
                const data = await client.api.cli.metricsAds.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'targets') {
                const data = await client.api.cli.metricsTargets.query({ config: cliConfig });
                printOutput(data);
                return;
            }
            if (subcommand === 'campaign') {
                const campaignId = action;
                if (!campaignId) throw new Error('Usage: bb metrics campaign <campaign_id>');
                const data = await client.api.cli.metricsCampaign.query({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'ad-group') {
                const adGroupId = action;
                if (!adGroupId) throw new Error('Usage: bb metrics ad-group <ad_group_id>');
                const data = await client.api.cli.metricsAdGroup.query({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'ad') {
                const adId = action;
                if (!adId) throw new Error('Usage: bb metrics ad <ad_id>');
                const data = await client.api.cli.metricsAd.query({ config: cliConfig, adId });
                printOutput(data);
                return;
            }
            if (subcommand === 'target') {
                const targetId = action;
                if (!targetId) throw new Error('Usage: bb metrics target <target_id>');
                const data = await client.api.cli.metricsTarget.query({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            throw new Error('Unknown metrics command.');
        }
        case 'enums': {
            if (subcommand === 'bid-strategy') {
                const data = await client.api.cli.enumsBidStrategy.query();
                printOutput(data);
                return;
            }
            if (subcommand === 'match-type') {
                const data = await client.api.cli.enumsMatchType.query();
                printOutput(data);
                return;
            }
            if (subcommand === 'placement') {
                const data = await client.api.cli.enumsPlacement.query();
                printOutput(data);
                return;
            }
            if (subcommand === 'state') {
                const data = await client.api.cli.enumsState.query();
                printOutput(data);
                return;
            }
            throw new Error('Unknown enums command.');
        }
        default:
            throw new Error(`Unknown command: ${command}`);
    }
};

const handleConfigCommand = async (subcommand?: string, action?: string, rest: string[] = []) => {
    if (subcommand === 'show') {
        const config = await loadConfig();
        printOutput({ config });
        return;
    }

    if (subcommand === 'clear') {
        await saveConfig({});
        printOutput({ cleared: true });
        return;
    }

    if (subcommand !== 'set' || !action) {
        throw new Error('Usage: bb config set <api-key|base-url|account|range> <value>');
    }

    const config = await loadConfig();
    const value = rest[0];
    if (!value) {
        if (action === 'range') {
            throw new Error(await buildRangeHelpMessage(config));
        }
        throw new Error('Missing value for config set');
    }

    switch (action) {
        case 'api-key':
            config.apiKey = value;
            break;
        case 'base-url':
            config.baseUrl = value;
            break;
        case 'account':
            if (!rest[1]) {
                throw new Error('Usage: bb config set account <adsAccountId> <countryCode>');
            }
            config.accountId = value;
            config.countryCode = rest[1];
            break;
        case 'range':
            config.range = value;
            break;
        default:
            throw new Error('Unknown config key. Use api-key, base-url, account, or range.');
    }

    await saveConfig(config);
    printOutput({ saved: true });
};

const printHelp = () => {
    console.log(`BidBeacon CLI

Usage:
  bb config show
  bb config clear
  bb config set api-key <value>
  bb config set base-url <value>
  bb config set account <adsAccountId> <countryCode>
  bb config set range <today|yesterday|7d|30d|YYYY-MM-DD..YYYY-MM-DD> (default: today)

  bb accounts list

  bb campaigns list
  bb campaigns get <campaign_id>
  bb campaigns create <name> <budget>
  bb campaigns update <campaign_id> --name <name> [--portfolio <id>] [--start <iso>] [--end <iso>]
  bb campaigns pause <campaign_id>
  bb campaigns resume <campaign_id>
  bb campaigns delete <campaign_id>
  bb campaigns set-budget <campaign_id> <budget>
  bb campaigns set-bid-strategy <campaign_id> <strategy>
  bb campaigns set-bid-adjustments <campaign_id> <placement|audience|creative> <json>

  bb ad-groups list
  bb ad-groups get <ad_group_id>
  bb ad-groups create <campaign_id> <name> <default_bid>
  bb ad-groups update <ad_group_id> <name>
  bb ad-groups set-default-bid <ad_group_id> <value>
  bb ad-groups pause <ad_group_id>
  bb ad-groups resume <ad_group_id>
  bb ad-groups delete <ad_group_id>

  bb ads list
  bb ads get <ad_id>
  bb ads create <ad_group_id> <asin|sku> [ASIN|SKU]
  bb ads update <ad_id> <state>
  bb ads delete <ad_id>

  bb targets list
  bb targets get <target_id>
  bb targets create keyword <ad_group_id> <keyword> <match_type> <bid>
  bb targets create product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU]
  bb targets delete <target_id>
  bb targets pause <target_id>
  bb targets resume <target_id>

  bb bids set <target_id> <value>
  bb bids adjust <target_id> <delta>

  bb metrics campaigns
  bb metrics ad-groups
  bb metrics ads
  bb metrics targets
  bb metrics campaign <campaign_id>
  bb metrics ad-group <ad_group_id>
  bb metrics ad <ad_id>
  bb metrics target <target_id>

  bb enums bid-strategy
  bb enums match-type
  bb enums placement
  bb enums state
`);
};

const loadConfig = async (): Promise<CliConfig> => {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf8');
        return JSON.parse(raw) as CliConfig;
    } catch {
        return {};
    }
};

const saveConfig = async (config: CliConfig) => {
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
};

const resolveApiConfig = (config: CliConfig) => {
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const apiKey = config.apiKey;
    if (!apiKey) {
        throw new Error('Missing API key. Run: bb config set api-key <value>');
    }

    return { baseUrl, apiKey };
};

const requireCliConfig = (config: CliConfig) => {
    if (!config.accountId || !config.countryCode) {
        throw new Error('Missing config: account + country. Use bb config set account <adsAccountId> <countryCode>.');
    }
    return {
        accountId: config.accountId,
        countryCode: config.countryCode,
        range: config.range ?? DEFAULT_RANGE,
    };
};

const printOutput = (data: unknown) => {
    console.log(JSON.stringify({ ok: true, data }, null, 2));
};

const parseArgs = (args: string[]) => {
    const flags: ParsedFlags = {};
    const positional: string[] = [];

    let index = 0;
    while (index < args.length) {
        const value = args[index];
        if (!value.startsWith('--')) {
            positional.push(value);
            index += 1;
            continue;
        }

        const [rawKey, inlineValue] = value.slice(2).split('=');
        const key = rawKey.trim();
        if (!key) {
            index += 1;
            continue;
        }

        if (inlineValue !== undefined) {
            flags[key] = inlineValue;
            index += 1;
            continue;
        }

        const next = args[index + 1];
        if (!next || next.startsWith('--')) {
            flags[key] = true;
            index += 1;
            continue;
        }

        flags[key] = next;
        index += 2;
    }

    return { positional, flags };
};

const readFlag = (flags: ParsedFlags, keys: string[]) => {
    for (const key of keys) {
        const value = flags[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return null;
};

const parseNumberArg = (value: string, label: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid number for ${label}.`);
    }
    return parsed;
};

const parseJsonArg = (value: string) => {
    try {
        return JSON.parse(value);
    } catch {
        throw new Error('Invalid JSON payload.');
    }
};

const buildRangeHelpMessage = async (config: CliConfig) => {
    const timezoneHint = await resolveAccountTimezoneHint(config);
    return `Missing value for config set range. Options: today (aliases: 1d, t), yesterday (alias: y), 7d (aliases: week, w), 30d (aliases: month, m), YYYY-MM-DD..YYYY-MM-DD (inclusive). Account timezone: ${timezoneHint}.`;
};

const resolveAccountTimezoneHint = async (config: CliConfig) => {
    if (!config.accountId || !config.countryCode) {
        return 'unknown (set account + country first)';
    }
    if (!config.apiKey) {
        return 'unknown (set api-key first)';
    }

    try {
        const apiConfig = resolveApiConfig(config);
        const client = createTRPCProxyClient<AppRouter>({
            links: [
                httpLink({
                    url: `${apiConfig.baseUrl}/api`,
                    headers() {
                        return { Authorization: `Bearer ${apiConfig.apiKey}` };
                    },
                }),
            ],
        });
        const data = await client.api.cli.accountsList.query();
        const countryCode = config.countryCode?.toUpperCase();
        const matches = data.items.filter(item => item.accountId === config.accountId);
        if (!countryCode && matches.length > 1) {
            const codes = Array.from(new Set(matches.map(item => (item.countryCode ?? '').toUpperCase()).filter(Boolean))).sort();
            return `unknown (multiple country codes: ${codes.join(', ') || 'unknown'}; set config country)`;
        }
        const account = matches.find(
            item => !countryCode || (item.countryCode ?? '').toUpperCase() === countryCode
        );
        if (!account) {
            return `unknown (account ${config.accountId} not found)`;
        }
        if (!account.countryCode) {
            return 'unknown (missing country code)';
        }
        const timezone = getTimezoneForCountry(account.countryCode);
        return `${timezone} (from ${account.countryCode})`;
    } catch {
        return 'unknown (unable to fetch)';
    }
};

type CliConfig = {
    baseUrl?: string;
    apiKey?: string;
    accountId?: string;
    countryCode?: string;
    range?: string;
};

type ParsedFlags = Record<string, string | boolean> & {
    help?: boolean;
};

await main().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : error }, null, 2));
    process.exit(1);
});
