#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createBidBeaconClient } from '@bidbeacon/http-client';
import { normalizeApiBaseUrl, withTransportHint } from './base-url';
import { CliUsageError, isCliUsageError } from './cli-errors';
import { type HelpTopicKey, renderHelp, resolveHelpTopicKey } from './help';
import { getTimezoneForCountry } from './timezones';

const DEFAULT_BASE_URL = 'http://localhost:8080';
const DEFAULT_RANGE = 'today';
const CONFIG_DIR = join(homedir(), '.bidbeacon');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const METRICS_KEYS = ['impressions', 'clicks', 'spend', 'purchases', 'sales', 'acos', 'cpc', 'ctr', 'roas'] as const;
const METRICS_KEYS_SET = new Set(METRICS_KEYS);
const METRICS_BUCKETS = ['auto', 'hour', 'day', 'week', 'month', 'year'] as const;
const METRICS_BUCKETS_SET = new Set(METRICS_BUCKETS);
const METRIC_FILTER_REGEX = /^\s*([^<>=!~]+)\s*(<=|>=|!=|=|<|>|~)\s*(.+)\s*$/;
const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const NUMERIC_ID_REGEX = /^[0-9]+$/;
const SEARCH_PAGE_LIMIT = 200;
const MAX_METRICS_TABLE_IDS_PER_REQUEST = 200;

const main = async () => {
    const { positional, flags } = parseArgs(process.argv.slice(2));
    const helpContext = await buildHelpContext();

    if (positional.length === 0 || flags.help) {
        const topicKey = resolveHelpTopicKey(positional);
        process.stdout.write(renderHelp(topicKey, helpContext));
        return;
    }

    const [rawCommand, subcommand, action, ...rest] = positional;
    const command = resolveCommandAlias(rawCommand);

    if (command === 'config') {
        if (!subcommand) {
            process.stdout.write(renderHelp('config', helpContext));
            return;
        }
        await handleConfigCommand(subcommand, action, rest);
        return;
    }

    switch (command) {
        case 'accounts': {
            if (!subcommand) {
                process.stdout.write(renderHelp('accounts', helpContext));
                return;
            }
            if (subcommand !== 'list') {
                throw new CliUsageError({ topicKey: 'accounts', message: `Unknown subcommand: ${subcommand}` });
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const data = await client['accounts/list'].query();
            printOutput(data);
            return;
        }
        case 'campaigns': {
            if (!subcommand) {
                process.stdout.write(renderHelp('campaigns', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const state = resolveListStateFlag(flags);
                const limitRaw = readFlag(flags, ['limit']);
                const offsetRaw = readFlag(flags, ['offset']);
                const data = await client['campaigns/list'].query({
                    config: cliConfig,
                    state,
                    limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                    offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'search') {
                if (!action) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <query>.' });
                }
                const query = action.trim();
                if (query.length === 0) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <query>.' });
                }
                const state = resolveListStateFlag(flags) ?? 'ALL';
                const limitRaw = readFlag(flags, ['limit']);
                const offsetRaw = readFlag(flags, ['offset']);
                const data = await searchCampaigns(client, cliConfig, query, {
                    state,
                    limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                    offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const data = await client['campaigns/get'].query({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [name, budget] = [action, rest[0]];
                if (!(name && budget)) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <name> <budget>.' });
                }
                const data = await client['campaigns/create'].mutate({
                    config: cliConfig,
                    name,
                    budget: parseNumberArg(budget, 'budget'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const name = readFlag(flags, ['name']);
                const portfolioId = readFlag(flags, ['portfolio']);
                const startDateTime = readFlag(flags, ['start']);
                const endDateTime = readFlag(flags, ['end']);
                const data = await client['campaigns/update'].mutate({
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
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const data = await client['campaigns/pause'].mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const data = await client['campaigns/resume'].mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const data = await client['campaigns/delete'].mutate({ config: cliConfig, campaignId });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-budget') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const budget = rest[0];
                if (!budget) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <campaign_id> <budget>.' });
                }
                const data = await client['campaigns/set-budget'].mutate({
                    config: cliConfig,
                    campaignId,
                    budget: parseNumberArg(budget, 'budget'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-bid-strategy') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const strategy = rest[0];
                if (!strategy) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <campaign_id> <strategy>.' });
                }
                const data = await client['campaigns/set-bid-strategy'].mutate({
                    config: cliConfig,
                    campaignId,
                    strategy,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-bid-adjustments') {
                const campaignId = requireNumericIdArg(action, { topicKey: 'campaigns', label: '<campaign_id>', expected: 'campaign_id' });
                const scope = rest[0];
                const json = rest[1];
                if (!(scope && json)) {
                    throw new CliUsageError({ topicKey: 'campaigns', message: 'Missing required args: <campaign_id> <scope> <json>.' });
                }
                const data = await client['campaigns/set-bid-adjustments'].mutate({
                    config: cliConfig,
                    campaignId,
                    scope,
                    adjustments: parseJsonArg(json),
                });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'campaigns', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'ad-groups': {
            if (!subcommand) {
                process.stdout.write(renderHelp('ad-groups', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const state = resolveListStateFlag(flags);
                const campaignId = parseOptionalNumericIdFlag(readFlag(flags, ['campaign', 'campaign-id']), {
                    topicKey: 'ad-groups',
                    label: '--campaign',
                    expected: 'campaign_id',
                });
                const limitRaw = readFlag(flags, ['limit']);
                const offsetRaw = readFlag(flags, ['offset']);
                const data = await client['ad-groups/list'].query({
                    config: cliConfig,
                    state,
                    campaignId,
                    limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                    offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const data = await client['ad-groups/get'].query({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [campaignIdRaw, name, bid] = [action, rest[0], rest[1]];
                if (!(campaignIdRaw && name && bid)) {
                    throw new CliUsageError({ topicKey: 'ad-groups', message: 'Missing required args: <campaign_id> <name> <default_bid>.' });
                }
                const campaignId = parseNumericId(campaignIdRaw, { topicKey: 'ad-groups', label: '<campaign_id>', expected: 'campaign_id' });
                const data = await client['ad-groups/create'].mutate({
                    config: cliConfig,
                    campaignId,
                    name,
                    defaultBid: parseNumberArg(bid, 'default_bid'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const name = rest[0];
                if (!name) {
                    throw new CliUsageError({ topicKey: 'ad-groups', message: 'Missing required args: <ad_group_id> <name>.' });
                }
                const data = await client['ad-groups/update'].mutate({ config: cliConfig, adGroupId, name });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-default-bid') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const value = rest[0];
                if (!value) {
                    throw new CliUsageError({ topicKey: 'ad-groups', message: 'Missing required args: <ad_group_id> <value>.' });
                }
                const data = await client['ad-groups/set-default-bid'].mutate({
                    config: cliConfig,
                    adGroupId,
                    value: parseNumberArg(value, 'value'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'pause') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const data = await client['ad-groups/pause'].mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const data = await client['ad-groups/resume'].mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const adGroupId = requireNumericIdArg(action, { topicKey: 'ad-groups', label: '<ad_group_id>', expected: 'ad_group_id' });
                const data = await client['ad-groups/delete'].mutate({ config: cliConfig, adGroupId });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'ad-groups', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'ads': {
            if (!subcommand) {
                process.stdout.write(renderHelp('ads', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const state = resolveListStateFlag(flags);
                const campaignId = parseOptionalNumericIdFlag(readFlag(flags, ['campaign', 'campaign-id']), { topicKey: 'ads', label: '--campaign', expected: 'campaign_id' });
                const adGroupId = parseOptionalNumericIdFlag(readFlag(flags, ['ad-group', 'ad-group-id']), { topicKey: 'ads', label: '--ad-group', expected: 'ad_group_id' });
                const asin = readFlag(flags, ['asin']);
                const limitRaw = readFlag(flags, ['limit']);
                const offsetRaw = readFlag(flags, ['offset']);
                const data = await client['ads/list'].query({
                    config: cliConfig,
                    state,
                    campaignId,
                    adGroupId,
                    productAsin: asin ?? undefined,
                    limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                    offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const adId = requireNumericIdArg(action, { topicKey: 'ads', label: '<ad_id>', expected: 'ad_id' });
                const data = await client['ads/get'].query({ config: cliConfig, adId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const [adGroupIdRaw, productId] = [action, rest[0]];
                const productIdType = rest[1] ?? 'ASIN';
                if (!(adGroupIdRaw && productId)) {
                    throw new CliUsageError({ topicKey: 'ads', message: 'Missing required args: <ad_group_id> <asin|sku>.' });
                }
                const adGroupId = parseNumericId(adGroupIdRaw, { topicKey: 'ads', label: '<ad_group_id>', expected: 'ad_group_id' });
                const data = await client['ads/create'].mutate({
                    config: cliConfig,
                    adGroupId,
                    productIdType,
                    productId,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'update') {
                const adId = requireNumericIdArg(action, { topicKey: 'ads', label: '<ad_id>', expected: 'ad_id' });
                const state = rest[0];
                if (!state) {
                    throw new CliUsageError({ topicKey: 'ads', message: 'Missing required args: <ad_id> <state>.' });
                }
                const data = await client['ads/update'].mutate({ config: cliConfig, adId, state });
                printOutput(data);
                return;
            }
            if (subcommand === 'delete') {
                const adId = requireNumericIdArg(action, { topicKey: 'ads', label: '<ad_id>', expected: 'ad_id' });
                const data = await client['ads/delete'].mutate({ config: cliConfig, adId });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'ads', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'asins': {
            if (!subcommand) {
                process.stdout.write(renderHelp('asins', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'get') {
                const asin = requireAsinArg(action, { topicKey: 'asins', label: '<asin>' });
                const rangeOverride = readFlag(flags, ['range']);
                const metrics = parseMetricsSelectionFlag(flags);
                const bucket = parseMetricsBucketFlag(flags);
                const data = await getAsinViewWithMetrics(client, cliConfig, asin, {
                    range: rangeOverride ?? undefined,
                    metrics,
                    bucket,
                });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'asins', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'targets': {
            if (!subcommand) {
                process.stdout.write(renderHelp('targets', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'list') {
                const state = resolveListStateFlag(flags);
                const campaignId = parseOptionalNumericIdFlag(readFlag(flags, ['campaign', 'campaign-id']), { topicKey: 'targets', label: '--campaign', expected: 'campaign_id' });
                const adGroupId = parseOptionalNumericIdFlag(readFlag(flags, ['ad-group', 'ad-group-id']), { topicKey: 'targets', label: '--ad-group', expected: 'ad_group_id' });
                const negative = parseOptionalBooleanFlag(readFlag(flags, ['negative']), { topicKey: 'targets', label: '--negative' });
                const limitRaw = readFlag(flags, ['limit']);
                const offsetRaw = readFlag(flags, ['offset']);
                const data = await client['targets/list'].query({
                    config: cliConfig,
                    state,
                    campaignId,
                    adGroupId,
                    negative,
                    limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                    offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'set-bid') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const value = rest[0];
                if (!value) {
                    throw new CliUsageError({ topicKey: 'targets', message: 'Missing required args: <target_id> <value>.' });
                }
                const data = await client['bids/set'].mutate({
                    config: cliConfig,
                    targetId,
                    value: parseNumberArg(value, 'value'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'adjust-bid') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const delta = rest[0];
                if (!delta) {
                    throw new CliUsageError({ topicKey: 'targets', message: 'Missing required args: <target_id> <delta>.' });
                }
                const data = await client['bids/adjust'].mutate({
                    config: cliConfig,
                    targetId,
                    delta: parseNumberArg(delta, 'delta'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'get') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const data = await client['targets/get'].query({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'create') {
                const targetType = action;
                if (!targetType) {
                    process.stdout.write(renderHelp('targets', helpContext));
                    return;
                }
                if (targetType === 'keyword') {
                    const [adGroupIdRaw, keyword, matchType, bid] = rest;
                    if (!(adGroupIdRaw && keyword && matchType && bid)) {
                        throw new CliUsageError({
                            topicKey: 'targets',
                            message: 'Missing required args: keyword <ad_group_id> <keyword> <match_type> <bid>.',
                        });
                    }
                    const adGroupId = parseNumericId(adGroupIdRaw, { topicKey: 'targets', label: '<ad_group_id>', expected: 'ad_group_id' });
                    const data = await client['targets/create/keyword'].mutate({
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
                    const [adGroupIdRaw, productId, matchType, bid, productIdType] = rest;
                    if (!(adGroupIdRaw && productId && matchType && bid)) {
                        throw new CliUsageError({
                            topicKey: 'targets',
                            message: 'Missing required args: product <ad_group_id> <asin|sku> <match_type> <bid> [ASIN|SKU].',
                        });
                    }
                    const adGroupId = parseNumericId(adGroupIdRaw, { topicKey: 'targets', label: '<ad_group_id>', expected: 'ad_group_id' });
                    const data = await client['targets/create/product'].mutate({
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
                throw new CliUsageError({ topicKey: 'targets', message: `Unknown create type: ${targetType}` });
            }
            if (subcommand === 'delete') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const data = await client['targets/delete'].mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'pause') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const data = await client['targets/pause'].mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            if (subcommand === 'resume') {
                const targetId = requireNumericIdArg(action, { topicKey: 'targets', label: '<target_id>', expected: 'target_id' });
                const data = await client['targets/resume'].mutate({ config: cliConfig, targetId });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'targets', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'history': {
            if (!subcommand) {
                process.stdout.write(renderHelp('history', helpContext));
                return;
            }

            const entity = resolveHistoryEntityRef(subcommand);
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            const entityId = requireNumericIdArg(action, {
                topicKey: 'history',
                label: entity.label,
                expected: entity.expected,
            });
            const rangeOverride = readFlag(flags, ['range']);
            const limitRaw = readFlag(flags, ['limit']);
            const offsetRaw = readFlag(flags, ['offset']);
            const limit = limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined;
            const offset = offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined;
            const rangeContext = resolveRangeContext(cliConfig, rangeOverride);

            const data = await client['history/list'].query({
                config: cliConfig,
                entityType: entity.entityType,
                entityId,
                range: rangeOverride ?? undefined,
                limit,
                offset,
            });
            printOutput({
                context: {
                    accountId: cliConfig.accountId,
                    countryCode: cliConfig.countryCode,
                    entityType: entity.entityType,
                    entityId,
                    range: rangeContext.range,
                    rangeSource: rangeContext.rangeSource,
                    timezone: rangeContext.timezone,
                    limit: limit ?? null,
                    offset: offset ?? null,
                },
                ...data,
            });
            return;
        }
        case 'bids': {
            if (!subcommand) {
                process.stdout.write(renderHelp('bids', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand === 'set') {
                const targetId = requireNumericIdArg(action, { topicKey: 'bids', label: '<target_id>', expected: 'target_id' });
                const value = rest[0];
                if (!value) {
                    throw new CliUsageError({ topicKey: 'bids', message: 'Missing required args: <target_id> <value>.' });
                }
                const data = await client['bids/set'].mutate({
                    config: cliConfig,
                    targetId,
                    value: parseNumberArg(value, 'value'),
                });
                printOutput(data);
                return;
            }
            if (subcommand === 'adjust') {
                const targetId = requireNumericIdArg(action, { topicKey: 'bids', label: '<target_id>', expected: 'target_id' });
                const delta = rest[0];
                if (!delta) {
                    throw new CliUsageError({ topicKey: 'bids', message: 'Missing required args: <target_id> <delta>.' });
                }
                const data = await client['bids/adjust'].mutate({
                    config: cliConfig,
                    targetId,
                    delta: parseNumberArg(delta, 'delta'),
                });
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'bids', message: `Unknown subcommand: ${subcommand}` });
        }
        case 'metrics': {
            if (!subcommand) {
                process.stdout.write(renderHelp('metrics', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            const cliConfig = requireCliConfig(config);
            if (subcommand !== 'series' && subcommand !== 'table') {
                throw new CliUsageError({ topicKey: 'metrics', message: `Unknown subcommand: ${subcommand}` });
            }
            const groupBy = readFlag(flags, ['group-by', 'groupby']);
            const entity = resolveMetricsEntity(action, groupBy, subcommand === 'series' ? 'metrics series' : 'metrics table');

            const ids = parseIdsFlag(flags);
            const campaignId = parseOptionalNumericIdFlag(readFlag(flags, ['campaign', 'campaign-id']), {
                topicKey: subcommand === 'series' ? 'metrics series' : 'metrics table',
                label: '--campaign',
                expected: 'campaign_id',
            });
            const adGroupId = parseOptionalNumericIdFlag(readFlag(flags, ['ad-group', 'ad-group-id']), {
                topicKey: subcommand === 'series' ? 'metrics series' : 'metrics table',
                label: '--ad-group',
                expected: 'ad_group_id',
            });
            const metrics = parseMetricsSelectionFlag(flags);
            const filters = parseMetricsFiltersFlag(flags);
            const rangeOverride = readFlag(flags, ['range']);
            const bucket = parseMetricsBucketFlag(flags);
            const rangeContext = resolveRangeContext(cliConfig, rangeOverride);
            const metricsContext = {
                accountId: cliConfig.accountId,
                countryCode: cliConfig.countryCode,
                groupBy: entity,
                ids: ids ?? [],
                campaignId: campaignId ?? null,
                adGroupId: adGroupId ?? null,
                metrics: resolveMetricKeys(metrics),
                filters: filters ?? {},
                range: rangeContext.range,
                rangeSource: rangeContext.rangeSource,
                timezone: rangeContext.timezone,
            };

            const sortField = readFlag(flags, ['sort']);
            const sortDirection = readFlag(flags, ['direction']);
            const limitRaw = readFlag(flags, ['limit']);
            const offsetRaw = readFlag(flags, ['offset']);

            if (subcommand === 'series' && (sortField || sortDirection || limitRaw || offsetRaw)) {
                throw new CliUsageError({
                    topicKey: 'metrics series',
                    message: 'Series metrics do not support --sort, --direction, --limit, or --offset.',
                });
            }
            if (subcommand === 'table' && bucket) {
                throw new CliUsageError({ topicKey: 'metrics table', message: 'Table metrics do not support --bucket.' });
            }

            const tableOptions =
                subcommand === 'table'
                    ? {
                          sort: {
                              field: parseSortField(sortField),
                              direction: parseSortDirection(sortDirection),
                          },
                          limit: limitRaw ? parsePositiveIntArg(limitRaw, 'limit') : undefined,
                          offset: offsetRaw ? parseNonNegativeIntArg(offsetRaw, 'offset') : undefined,
                      }
                    : null;

            if (subcommand === 'series') {
                if (entity === 'campaigns') {
                    if (campaignId || adGroupId) {
                        throw new CliUsageError({
                            topicKey: 'metrics series',
                            message: 'Series campaigns does not accept --campaign or --ad-group.',
                        });
                    }
                    const data = await client['metrics/series/campaigns'].query({
                        config: cliConfig,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        bucket: bucket ?? undefined,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            bucket: bucket ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'ad-groups') {
                    if (adGroupId) {
                        throw new CliUsageError({
                            topicKey: 'metrics series',
                            message: 'Series ad-groups does not accept --ad-group (use --campaign to scope).',
                        });
                    }
                    const data = await client['metrics/series/ad-groups'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        bucket: bucket ?? undefined,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            bucket: bucket ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'ads') {
                    const data = await client['metrics/series/ads'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        adGroupId: adGroupId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        bucket: bucket ?? undefined,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            bucket: bucket ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'targets') {
                    const data = await client['metrics/series/targets'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        adGroupId: adGroupId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        bucket: bucket ?? undefined,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            bucket: bucket ?? null,
                        },
                        ...data,
                    });
                    return;
                }
            }

            if (subcommand === 'table') {
                if (!tableOptions) {
                    throw new Error('Missing table options.');
                }

                if (entity === 'campaigns') {
                    if (campaignId || adGroupId) {
                        throw new CliUsageError({
                            topicKey: 'metrics table',
                            message: 'Table campaigns does not accept --campaign or --ad-group.',
                        });
                    }
                    const data = await client['metrics/table/campaigns'].query({
                        config: cliConfig,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        sort: tableOptions.sort,
                        limit: tableOptions.limit,
                        offset: tableOptions.offset,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            sort: tableOptions.sort.field,
                            direction: tableOptions.sort.direction,
                            limit: tableOptions.limit ?? null,
                            offset: tableOptions.offset ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'ad-groups') {
                    if (adGroupId) {
                        throw new CliUsageError({
                            topicKey: 'metrics table',
                            message: 'Table ad-groups does not accept --ad-group (use --campaign to scope).',
                        });
                    }
                    const data = await client['metrics/table/ad-groups'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        sort: tableOptions.sort,
                        limit: tableOptions.limit,
                        offset: tableOptions.offset,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            sort: tableOptions.sort.field,
                            direction: tableOptions.sort.direction,
                            limit: tableOptions.limit ?? null,
                            offset: tableOptions.offset ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'ads') {
                    const data = await client['metrics/table/ads'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        adGroupId: adGroupId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        sort: tableOptions.sort,
                        limit: tableOptions.limit,
                        offset: tableOptions.offset,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            sort: tableOptions.sort.field,
                            direction: tableOptions.sort.direction,
                            limit: tableOptions.limit ?? null,
                            offset: tableOptions.offset ?? null,
                        },
                        ...data,
                    });
                    return;
                }
                if (entity === 'targets') {
                    const data = await client['metrics/table/targets'].query({
                        config: cliConfig,
                        campaignId: campaignId ?? undefined,
                        adGroupId: adGroupId ?? undefined,
                        ids,
                        metrics,
                        filters,
                        range: rangeOverride ?? undefined,
                        sort: tableOptions.sort,
                        limit: tableOptions.limit,
                        offset: tableOptions.offset,
                    });
                    printOutput({
                        context: {
                            ...metricsContext,
                            sort: tableOptions.sort.field,
                            direction: tableOptions.sort.direction,
                            limit: tableOptions.limit ?? null,
                            offset: tableOptions.offset ?? null,
                        },
                        ...data,
                    });
                    return;
                }
            }
            throw new CliUsageError({ topicKey: subcommand === 'series' ? 'metrics series' : 'metrics table', message: `Unknown entity: ${entity}` });
        }
        case 'enums': {
            if (!subcommand) {
                process.stdout.write(renderHelp('enums', helpContext));
                return;
            }
            const config = await loadConfig();
            const client = createApiClient(config);
            if (subcommand === 'bid-strategy') {
                const data = await client['enums/bid-strategy'].query();
                printOutput(data);
                return;
            }
            if (subcommand === 'match-type') {
                const data = await client['enums/match-type'].query();
                printOutput(data);
                return;
            }
            if (subcommand === 'placement') {
                const data = await client['enums/placement'].query();
                printOutput(data);
                return;
            }
            if (subcommand === 'state') {
                const data = await client['enums/state'].query();
                printOutput(data);
                return;
            }
            throw new CliUsageError({ topicKey: 'enums', message: `Unknown subcommand: ${subcommand}` });
        }
        default:
            throw new CliUsageError({ topicKey: 'global', message: `Unknown command: ${command}` });
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
        throw new CliUsageError({ topicKey: 'config', message: 'Missing config subcommand. Use: bb config set <key> <value>.' });
    }

    const config = await loadConfig();
    const value = rest[0];
    if (!value) {
        if (action === 'range') {
            throw new CliUsageError({ topicKey: 'config', message: await buildRangeHelpMessage(config) });
        }
        throw new CliUsageError({ topicKey: 'config', message: 'Missing value for config set.' });
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
                throw new CliUsageError({ topicKey: 'config', message: 'Missing required args: account <adsAccountId> <countryCode>.' });
            }
            config.accountId = value;
            config.countryCode = rest[1];
            break;
        case 'range':
            config.range = value;
            break;
        default:
            throw new CliUsageError({ topicKey: 'config', message: `Unknown config key: ${action}.` });
    }

    await saveConfig(config);
    printOutput({ saved: true });
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
    const baseUrl = normalizeApiBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    const apiKey = config.apiKey;
    if (!apiKey) {
        throw new CliUsageError({ topicKey: 'config', message: 'Missing API key. Run: bb config set api-key <value>.' });
    }

    return { baseUrl, apiKey };
};

const createApiClient = (config: CliConfig) => {
    const apiConfig = resolveApiConfig(config);
    return createBidBeaconClient({
        baseUrl: apiConfig.baseUrl,
        apiKey: apiConfig.apiKey,
        batch: false,
    });
};

const resolveCommandAlias = (value?: string) => {
    if (!value) {
        return value;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'campaign') {
        return 'campaigns';
    }
    return normalized;
};

const requireCliConfig = (config: CliConfig) => {
    if (!(config.accountId && config.countryCode)) {
        throw new CliUsageError({
            topicKey: 'config',
            message: 'Missing config: account + country. Use: bb config set account <adsAccountId> <countryCode>.',
        });
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

const resolveRangeContext = (config: RequiredCliConfig, rangeOverride: string | null) => {
    return {
        range: rangeOverride ?? config.range,
        rangeSource: rangeOverride ? 'flag' : 'config',
        timezone: getTimezoneForCountry(config.countryCode),
    };
};

const parseArgs = (args: string[]) => {
    const flags: ParsedFlags = {};
    const positional: string[] = [];

    let index = 0;
    while (index < args.length) {
        const value = args[index];
        if (value === '-h') {
            flags.help = true;
            index += 1;
            continue;
        }
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
            if (flags[key] === undefined) {
                flags[key] = inlineValue;
            } else if (Array.isArray(flags[key])) {
                flags[key] = [...flags[key], inlineValue];
            } else {
                flags[key] = [flags[key] as string, inlineValue];
            }
            index += 1;
            continue;
        }

        const next = args[index + 1];
        if (!next || next.startsWith('--')) {
            flags[key] = true;
            index += 1;
            continue;
        }

        if (flags[key] === undefined) {
            flags[key] = next;
        } else if (Array.isArray(flags[key])) {
            flags[key] = [...flags[key], next];
        } else {
            flags[key] = [flags[key] as string, next];
        }
        index += 2;
    }

    return { positional, flags };
};

const readFlag = (flags: ParsedFlags, keys: string[]) => {
    for (const key of keys) {
        const value = flags[key];
        if (Array.isArray(value)) {
            return value.find(entry => typeof entry === 'string') ?? null;
        }
        if (typeof value === 'string') {
            return value;
        }
    }
    return null;
};

const readBooleanFlag = (flags: ParsedFlags, keys: string[]) => {
    for (const key of keys) {
        const value = flags[key];
        if (value === true) {
            return true;
        }
        if (Array.isArray(value)) {
            return value.some(entry => {
                if (entry === true) {
                    return true;
                }
                if (typeof entry !== 'string') {
                    return false;
                }
                const normalized = entry.trim().toLowerCase();
                return ['true', '1', 'yes', 'y'].includes(normalized);
            });
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'yes', 'y'].includes(normalized)) {
                return true;
            }
            if (['false', '0', 'no', 'n'].includes(normalized)) {
                return false;
            }
        }
    }
    return false;
};

const readFlagValues = (flags: ParsedFlags, keys: string[]) => {
    const values: string[] = [];
    for (const key of keys) {
        const value = flags[key];
        if (Array.isArray(value)) {
            values.push(...value.filter(entry => typeof entry === 'string'));
        } else if (typeof value === 'string') {
            values.push(value);
        }
    }
    return values;
};

const resolveListStateFlag = (flags: ParsedFlags) => {
    const allEnabled = readBooleanFlag(flags, ['all']);
    if (allEnabled) {
        return 'ALL';
    }

    const raw = readFlag(flags, ['state']);
    if (!raw) {
        return undefined;
    }

    const normalized = raw.trim().toUpperCase();
    const allowed = new Set(['ENABLED', 'PAUSED', 'ARCHIVED', 'OTHER', 'ALL']);
    if (!allowed.has(normalized)) {
        throw new Error('Invalid --state. Use ENABLED, PAUSED, ARCHIVED, OTHER, or ALL.');
    }
    return normalized;
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

const looksLikeAsin = (value: string) => {
    const trimmed = value.trim().toUpperCase();
    return ASIN_REGEX.test(trimmed);
};

const parseNumericId = (value: string, input: { topicKey: HelpTopicKey; label: string; expected: string }) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
        throw new CliUsageError({ topicKey: input.topicKey, message: `Missing ${input.label}.` });
    }
    if (NUMERIC_ID_REGEX.test(trimmed)) {
        return trimmed;
    }

    const asinHint = looksLikeAsin(trimmed) ? ' This looks like an ASIN.' : '';
    throw new CliUsageError({
        topicKey: input.topicKey,
        message: `Invalid ${input.label}: expected ${input.expected} (numeric), received ${JSON.stringify(trimmed)}.${asinHint}`,
    });
};

const requireNumericIdArg = (value: string | undefined, input: { topicKey: HelpTopicKey; label: string; expected: string }) => {
    if (!value) {
        throw new CliUsageError({ topicKey: input.topicKey, message: `Missing ${input.label}.` });
    }
    return parseNumericId(value, input);
};

const parseOptionalNumericIdFlag = (value: string | null, input: { topicKey: HelpTopicKey; label: string; expected: string }) => {
    if (!value) {
        return undefined;
    }
    return parseNumericId(value, input);
};

const parseOptionalBooleanFlag = (value: string | null, input: { topicKey: HelpTopicKey; label: string }) => {
    if (value === null) {
        return undefined;
    }
    try {
        return parseBooleanValue(value);
    } catch {
        throw new CliUsageError({
            topicKey: input.topicKey,
            message: `Invalid ${input.label}: expected true|false.`,
        });
    }
};

const resolveHistoryEntityRef = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'campaign' || normalized === 'campaigns') {
        return {
            entityType: 'campaign' as const,
            label: '<campaign_id>',
            expected: 'campaign_id',
        };
    }
    if (normalized === 'ad-group' || normalized === 'ad-groups' || normalized === 'adgroup' || normalized === 'adgroups') {
        return {
            entityType: 'adGroup' as const,
            label: '<ad_group_id>',
            expected: 'ad_group_id',
        };
    }
    if (normalized === 'ad' || normalized === 'ads') {
        return {
            entityType: 'ad' as const,
            label: '<ad_id>',
            expected: 'ad_id',
        };
    }
    if (normalized === 'target' || normalized === 'targets') {
        return {
            entityType: 'target' as const,
            label: '<target_id>',
            expected: 'target_id',
        };
    }
    throw new CliUsageError({
        topicKey: 'history',
        message: `Unknown history entity: ${value}. Use campaigns, ad-groups, ads, or targets.`,
    });
};

const parseAsin = (value: string, input: { topicKey: HelpTopicKey; label: string }) => {
    const trimmed = value.trim().toUpperCase();
    if (ASIN_REGEX.test(trimmed)) {
        return trimmed;
    }
    throw new CliUsageError({
        topicKey: input.topicKey,
        message: `Invalid ${input.label}: expected an ASIN (10 alphanumeric chars), received ${JSON.stringify(value.trim())}.`,
    });
};

const requireAsinArg = (value: string | undefined, input: { topicKey: HelpTopicKey; label: string }) => {
    if (!value) {
        throw new CliUsageError({ topicKey: input.topicKey, message: `Missing ${input.label}.` });
    }
    return parseAsin(value, input);
};

const parseIdsFlag = (flags: ParsedFlags) => {
    const raw = readFlag(flags, ['ids']);
    if (!raw) {
        return undefined;
    }
    const ids = raw
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    if (ids.length === 0) {
        throw new Error('Invalid --ids. Use comma-separated values.');
    }
    return ids;
};

const parseSortField = (value?: string) => {
    if (!value) {
        return 'spend' as const;
    }
    const normalized = value.trim().toLowerCase();
    if (!METRICS_KEYS_SET.has(normalized as (typeof METRICS_KEYS)[number])) {
        throw new Error('Invalid --sort. Use impressions, clicks, purchases, spend, sales, acos, cpc, ctr, or roas.');
    }
    return normalized as (typeof METRICS_KEYS)[number];
};

const parseSortDirection = (value?: string) => {
    if (!value) {
        return 'desc' as const;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized !== 'asc' && normalized !== 'desc') {
        throw new Error('Invalid --direction. Use asc or desc.');
    }
    return normalized as 'asc' | 'desc';
};

const parsePositiveIntArg = (value: string, label: string) => {
    const parsed = Number(value);
    if (!(Number.isFinite(parsed) && Number.isInteger(parsed)) || parsed < 1) {
        throw new Error(`Invalid ${label}. Use an integer >= 1.`);
    }
    return parsed;
};

const parseNonNegativeIntArg = (value: string, label: string) => {
    const parsed = Number(value);
    if (!(Number.isFinite(parsed) && Number.isInteger(parsed)) || parsed < 0) {
        throw new Error(`Invalid ${label}. Use an integer >= 0.`);
    }
    return parsed;
};

const parseMetricsSelectionFlag = (flags: ParsedFlags) => {
    const raw = readFlag(flags, ['metrics']);
    if (!raw) {
        return undefined;
    }
    const entries = raw
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean);
    if (entries.length === 0) {
        throw new Error('Invalid --metrics. Use a comma-separated list of metric keys.');
    }
    for (const key of entries) {
        if (!METRICS_KEYS_SET.has(key as (typeof METRICS_KEYS)[number])) {
            throw new Error(`Invalid metric key: ${key}.`);
        }
    }
    return entries as (typeof METRICS_KEYS)[number][];
};

const parseMetricsBucketFlag = (flags: ParsedFlags) => {
    const raw = readFlag(flags, ['bucket']);
    if (!raw) {
        return undefined;
    }
    const normalized = raw.trim().toLowerCase();
    if (!METRICS_BUCKETS_SET.has(normalized as (typeof METRICS_BUCKETS)[number])) {
        throw new Error('Invalid --bucket. Use auto, hour, day, week, month, or year.');
    }
    return normalized as (typeof METRICS_BUCKETS)[number];
};

const parseMetricsFiltersFlag = (flags: ParsedFlags) => {
    const entries = readFlagValues(flags, ['filter']);
    const filters: Record<string, unknown> = {};

    for (const entry of entries) {
        const parsed = parseFilterExpression(entry);
        applyFilterExpression(filters, parsed);
    }

    const search = readFlag(flags, ['search']);
    if (search) {
        filters.search = search;
    }

    const state = resolveListStateFlag(flags);
    if (state) {
        filters.state = state;
    }

    return Object.keys(filters).length > 0 ? filters : undefined;
};

const parseFilterExpression = (raw: string) => {
    const match = raw.match(METRIC_FILTER_REGEX);
    if (!match) {
        throw new Error(`Invalid --filter expression: ${raw}`);
    }
    const [, key, operator, value] = match;
    return { key: key.trim(), operator, value: value.trim() };
};

const applyFilterExpression = (filters: Record<string, unknown>, expression: { key: string; operator: string; value: string }) => {
    const key = expression.key;
    const operator = expression.operator;
    const value = expression.value;

    const normalizedKey = key.trim();
    const metricKey = resolveMetricKey(normalizedKey);

    if (metricKey) {
        applyMetricRangeFilter(filters, metricKey, operator, value);
        return;
    }

    switch (normalizedKey) {
        case 'search':
        case 'name': {
            if (operator !== '=' && operator !== '~') {
                throw new Error(`Invalid operator for ${normalizedKey}. Use = or ~.`);
            }
            filters.search = value;
            return;
        }
        case 'state':
        case 'status':
        case 'active-status': {
            if (operator !== '=') {
                throw new Error(`Invalid operator for ${normalizedKey}. Use =.`);
            }
            filters.state = value.trim().toUpperCase();
            return;
        }
        case 'targeting':
        case 'type': {
            if (operator !== '=') {
                throw new Error(`Invalid operator for ${normalizedKey}. Use =.`);
            }
            filters.targeting = value.trim().toUpperCase();
            return;
        }
        case 'target-type': {
            if (operator !== '=') {
                throw new Error(`Invalid operator for ${normalizedKey}. Use =.`);
            }
            filters.targetType = value.trim().toUpperCase();
            return;
        }
        case 'target-match-type': {
            if (operator !== '=') {
                throw new Error(`Invalid operator for ${normalizedKey}. Use =.`);
            }
            filters.targetMatchType = value.trim().toUpperCase();
            return;
        }
        case 'budget': {
            applyRangeFilter(filters, 'budget', operator, value);
            return;
        }
        case 'end-date': {
            applyDateFilter(filters, operator, value);
            return;
        }
        case 'out-of-budget': {
            if (operator !== '=' && operator !== '!=') {
                throw new Error('Invalid operator for out-of-budget. Use = or !=.');
            }
            const parsed = parseBooleanValue(value);
            filters.outOfBudget = operator === '!=' ? !parsed : parsed;
            return;
        }
        default:
            throw new Error(`Unknown filter key: ${normalizedKey}`);
    }
};

const resolveMetricKey = (key: string) => {
    const trimmed = key.trim().toLowerCase();
    if (trimmed.startsWith('metrics.')) {
        const candidate = trimmed.replace('metrics.', '');
        return METRICS_KEYS_SET.has(candidate as (typeof METRICS_KEYS)[number]) ? candidate : null;
    }
    if (METRICS_KEYS_SET.has(trimmed as (typeof METRICS_KEYS)[number])) {
        return trimmed;
    }
    return null;
};

const applyMetricRangeFilter = (filters: Record<string, unknown>, metric: string, operator: string, rawValue: string) => {
    const numeric = parseNumberArg(rawValue, `metrics.${metric}`);
    const metricsFilters = (filters.metrics as Record<string, { min?: number; max?: number }> | undefined) ?? {};
    const existing = metricsFilters[metric] ?? {};

    const next = applyRangeOperator(existing, operator, numeric, `metrics.${metric}`);
    metricsFilters[metric] = next;
    filters.metrics = metricsFilters;
};

const applyRangeFilter = (filters: Record<string, unknown>, key: string, operator: string, rawValue: string) => {
    const numeric = parseNumberArg(rawValue, key);
    const range = (filters[key] as { min?: number; max?: number } | undefined) ?? {};
    const next = applyRangeOperator(range, operator, numeric, key);
    filters[key] = next;
};

const applyRangeOperator = (range: { min?: number; max?: number }, operator: string, value: number, label: string) => {
    const next = { ...range };
    switch (operator) {
        case '>':
        case '>=':
            next.min = value;
            break;
        case '<':
        case '<=':
            next.max = value;
            break;
        case '=':
            next.min = value;
            next.max = value;
            break;
        default:
            throw new Error(`Invalid operator for ${label}. Use =, >=, <=, >, or <.`);
    }
    return next;
};

const applyDateFilter = (filters: Record<string, unknown>, operator: string, value: string) => {
    const endDate = (filters.endDate as { before?: string; after?: string } | undefined) ?? {};
    if (operator === '>' || operator === '>=') {
        endDate.after = value;
    } else if (operator === '<' || operator === '<=') {
        endDate.before = value;
    } else if (operator === '=') {
        endDate.after = value;
        endDate.before = value;
    } else {
        throw new Error('Invalid operator for end-date. Use =, >=, <=, >, or <.');
    }
    filters.endDate = endDate;
};

const parseBooleanValue = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
        return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
        return false;
    }
    throw new Error(`Invalid boolean value: ${value}.`);
};

const buildRangeHelpMessage = async (config: CliConfig) => {
    const timezoneHint = await resolveAccountTimezoneHint(config);
    return `Missing value for config set range. Options: today (aliases: 1d, t), yesterday (alias: y), 7d (aliases: week, w), 30d (aliases: month, m), YYYY-MM-DD..YYYY-MM-DD (inclusive). Account timezone: ${timezoneHint}.`;
};

const resolveAccountTimezoneHint = async (config: CliConfig) => {
    if (!(config.accountId && config.countryCode)) {
        return 'unknown (set account + country first)';
    }
    if (!config.apiKey) {
        return 'unknown (set api-key first)';
    }

    try {
        const client = createApiClient(config);
        const data = await client['accounts/list'].query();
        const countryCode = config.countryCode?.toUpperCase();
        const matches = data.items.filter(item => item.accountId === config.accountId);
        if (!countryCode && matches.length > 1) {
            const codes = Array.from(new Set(matches.map(item => (item.countryCode ?? '').toUpperCase()).filter(Boolean))).sort();
            return `unknown (multiple country codes: ${codes.join(', ') || 'unknown'}; set config country)`;
        }
        const account = matches.find(item => !countryCode || (item.countryCode ?? '').toUpperCase() === countryCode);
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

const searchCampaigns = async (client: ApiClient, config: RequiredCliConfig, query: string, options: { state: string; limit?: number; offset?: number }) => {
    const normalizedQuery = query.trim().toLowerCase();
    const requestedLimit = options.limit ?? 20;
    const requestedOffset = options.offset ?? 0;
    const matchedItems: CampaignListItem[] = [];

    let pageOffset = 0;
    while (true) {
        const page = await client['campaigns/list'].query({
            config,
            state: options.state as CampaignSearchState,
            limit: SEARCH_PAGE_LIMIT,
            offset: pageOffset,
        });
        if (page.items.length === 0) {
            break;
        }

        for (const item of page.items) {
            const idMatch = item.campaignId.toLowerCase().includes(normalizedQuery);
            const nameMatch = (item.name ?? '').toLowerCase().includes(normalizedQuery);
            if (idMatch || nameMatch) {
                matchedItems.push(item);
            }
        }

        if (page.items.length < SEARCH_PAGE_LIMIT) {
            break;
        }
        pageOffset += SEARCH_PAGE_LIMIT;
    }

    return {
        query,
        totalMatched: matchedItems.length,
        items: matchedItems.slice(requestedOffset, requestedOffset + requestedLimit),
    };
};

const resolveMetricsEntity = (action: string | undefined, groupBy: string | null, topicKey: HelpTopicKey) => {
    const actionValue = action ? normalizeMetricsEntity(action) : null;
    const groupByValue = groupBy ? normalizeMetricsEntity(groupBy) : null;

    if (action && !actionValue) {
        throw new CliUsageError({
            topicKey,
            message: `Unknown entity: ${action}. Use campaigns, ad-groups, ads, or targets.`,
        });
    }
    if (groupBy && !groupByValue) {
        throw new CliUsageError({
            topicKey,
            message: `Invalid --group-by: ${groupBy}. Use campaigns, ad-groups, ads, or targets.`,
        });
    }
    if (actionValue && groupByValue && actionValue !== groupByValue) {
        throw new CliUsageError({
            topicKey,
            message: `Conflicting entity selectors: positional ${actionValue} and --group-by ${groupByValue}.`,
        });
    }

    const resolved = actionValue ?? groupByValue;
    if (!resolved) {
        throw new CliUsageError({
            topicKey,
            message: 'Missing entity. Use campaigns, ad-groups, ads, or targets (or pass --group-by).',
        });
    }
    return resolved;
};

const normalizeMetricsEntity = (value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'campaign' || normalized === 'campaigns') {
        return 'campaigns' as const;
    }
    if (normalized === 'ad-group' || normalized === 'ad-groups' || normalized === 'adgroup' || normalized === 'adgroups') {
        return 'ad-groups' as const;
    }
    if (normalized === 'ad' || normalized === 'ads') {
        return 'ads' as const;
    }
    if (normalized === 'target' || normalized === 'targets') {
        return 'targets' as const;
    }
    return null;
};

const getAsinViewWithMetrics = async (client: ApiClient, config: RequiredCliConfig, asin: string, options: { range?: string; metrics?: MetricsSelection; bucket?: MetricsBucket }) => {
    const tree = await client['asins/get'].query({ config, asin });
    const metricKeys = resolveMetricKeys(options.metrics);
    const requestedRange = options.range ?? config.range;
    const rangeSource = options.range ? 'flag' : 'config';
    const scope = collectAsinScope(tree);

    const [campaignTable, adGroupTable, targetTable, adTable, adSeries] = await Promise.all([
        queryCampaignMetricsTable(client, config, scope.campaignIds, options.range, options.metrics),
        queryAdGroupMetricsTable(client, config, scope.adGroupIds, options.range, options.metrics),
        queryTargetMetricsTable(client, config, scope.targetIds, options.range, options.metrics),
        queryAdMetricsTable(client, config, scope.adIds, options.range, options.metrics),
        queryAdMetricsSeries(client, config, scope.adIds, options.range, options.metrics, options.bucket),
    ]);

    const campaignMetricsById = new Map(campaignTable.items.map(item => [item.campaignId, normalizeMetrics(item.metrics, metricKeys)]));
    const adGroupMetricsById = new Map(adGroupTable.items.map(item => [item.adGroupId, normalizeMetrics(item.metrics, metricKeys)]));
    const targetMetricsById = new Map(targetTable.items.map(item => [item.targetId, normalizeMetrics(item.metrics, metricKeys)]));
    const adMetricsById = new Map(adTable.items.map(item => [item.adId, normalizeMetrics(item.metrics, metricKeys)]));

    const campaigns = tree.campaigns.map(campaign => ({
        ...campaign,
        metrics: campaignMetricsById.get(campaign.campaignId) ?? buildZeroMetrics(metricKeys),
        targets: campaign.targets.map(target => ({
            ...target,
            metrics: targetMetricsById.get(target.targetId) ?? buildZeroMetrics(metricKeys),
        })),
        adGroups: campaign.adGroups.map(adGroup => ({
            ...adGroup,
            metrics: adGroupMetricsById.get(adGroup.adGroupId) ?? buildZeroMetrics(metricKeys),
            targets: adGroup.targets.map(target => ({
                ...target,
                metrics: targetMetricsById.get(target.targetId) ?? buildZeroMetrics(metricKeys),
            })),
            ads: adGroup.ads.map(ad => ({
                ...ad,
                metrics: adMetricsById.get(ad.adId) ?? buildZeroMetrics(metricKeys),
            })),
        })),
    }));
    const timezone = adSeries?.timezone ?? getTimezoneForCountry(config.countryCode);
    const context = {
        accountId: config.accountId,
        countryCode: config.countryCode,
        range: requestedRange,
        rangeSource,
        bucket: options.bucket ?? null,
        metrics: metricKeys,
        timezone,
        resolvedRange: adSeries?.range ?? null,
        scope: {
            campaigns: campaigns.length,
            adGroups: scope.adGroupIds.length,
            ads: scope.adIds.length,
            targets: scope.targetIds.length,
        },
    };

    const metricsOutput = adSeries
        ? {
              range: adSeries.range,
              timezone: adSeries.timezone,
              granularity: adSeries.granularity,
              totals: normalizeMetrics(adSeries.totals, metricKeys),
              series: adSeries.series.map(point => ({
                  ...point,
                  metrics: normalizeMetrics(point.metrics, metricKeys),
              })),
          }
        : {
              range: requestedRange,
              totals: normalizeMetrics(adTable.totals, metricKeys),
          };

    return {
        asin,
        context,
        campaigns,
        metrics: metricsOutput,
    };
};

const queryCampaignMetricsTable = async (client: ApiClient, config: RequiredCliConfig, ids: string[], range: string | undefined, metrics: MetricsSelection) => {
    if (ids.length === 0) {
        return { totals: buildZeroMetrics(resolveMetricKeys(metrics)), items: [] as CampaignMetricsTableItem[] };
    }
    return queryTableInChunks<CampaignMetricsTableItem>(ids, async chunkIds => {
        const data = await client['metrics/table/campaigns'].query({
            config,
            ids: chunkIds,
            range,
            metrics,
            limit: MAX_METRICS_TABLE_IDS_PER_REQUEST,
        });
        return { totals: data.totals, items: data.items };
    });
};

const queryAdGroupMetricsTable = async (client: ApiClient, config: RequiredCliConfig, ids: string[], range: string | undefined, metrics: MetricsSelection) => {
    if (ids.length === 0) {
        return { totals: buildZeroMetrics(resolveMetricKeys(metrics)), items: [] as AdGroupMetricsTableItem[] };
    }
    return queryTableInChunks<AdGroupMetricsTableItem>(ids, async chunkIds => {
        const data = await client['metrics/table/ad-groups'].query({
            config,
            ids: chunkIds,
            range,
            metrics,
            limit: MAX_METRICS_TABLE_IDS_PER_REQUEST,
        });
        return { totals: data.totals, items: data.items };
    });
};

const queryTargetMetricsTable = async (client: ApiClient, config: RequiredCliConfig, ids: string[], range: string | undefined, metrics: MetricsSelection) => {
    if (ids.length === 0) {
        return { totals: buildZeroMetrics(resolveMetricKeys(metrics)), items: [] as TargetMetricsTableItem[] };
    }
    return queryTableInChunks<TargetMetricsTableItem>(ids, async chunkIds => {
        const data = await client['metrics/table/targets'].query({
            config,
            ids: chunkIds,
            range,
            metrics,
            limit: MAX_METRICS_TABLE_IDS_PER_REQUEST,
        });
        return { totals: data.totals, items: data.items };
    });
};

const queryAdMetricsTable = async (client: ApiClient, config: RequiredCliConfig, ids: string[], range: string | undefined, metrics: MetricsSelection) => {
    if (ids.length === 0) {
        return { totals: buildZeroMetrics(resolveMetricKeys(metrics)), items: [] as AdMetricsTableItem[] };
    }
    return queryTableInChunks<AdMetricsTableItem>(ids, async chunkIds => {
        const data = await client['metrics/table/ads'].query({
            config,
            ids: chunkIds,
            range,
            metrics,
            limit: MAX_METRICS_TABLE_IDS_PER_REQUEST,
        });
        return { totals: data.totals, items: data.items };
    });
};

const queryAdMetricsSeries = async (client: ApiClient, config: RequiredCliConfig, ids: string[], range: string | undefined, metrics: MetricsSelection, bucket: MetricsBucket | undefined) => {
    if (!bucket || ids.length === 0) {
        return null;
    }
    return client['metrics/series/ads'].query({
        config,
        ids,
        range,
        metrics,
        bucket,
    });
};

const queryTableInChunks = async <TItem>(ids: string[], query: (chunkIds: string[]) => Promise<{ totals: MetricRecord; items: TItem[] }>): Promise<{ totals: MetricRecord; items: TItem[] }> => {
    const chunks = chunkArray(ids, MAX_METRICS_TABLE_IDS_PER_REQUEST);
    const results = await Promise.all(chunks.map(chunk => query(chunk)));
    const totals = sumMetrics(results.map(result => result.totals));
    const items = results.flatMap(result => result.items);
    return { totals, items };
};

const collectAsinScope = (tree: AsinsTreeOutput) => {
    const campaignIds: string[] = [];
    const adGroupIds: string[] = [];
    const targetIds: string[] = [];
    const adIds: string[] = [];

    for (const campaign of tree.campaigns) {
        campaignIds.push(campaign.campaignId);
        for (const target of campaign.targets) {
            targetIds.push(target.targetId);
        }
        for (const adGroup of campaign.adGroups) {
            adGroupIds.push(adGroup.adGroupId);
            for (const target of adGroup.targets) {
                targetIds.push(target.targetId);
            }
            for (const ad of adGroup.ads) {
                adIds.push(ad.adId);
            }
        }
    }

    return {
        campaignIds: uniqueStrings(campaignIds),
        adGroupIds: uniqueStrings(adGroupIds),
        targetIds: uniqueStrings(targetIds),
        adIds: uniqueStrings(adIds),
    };
};

const chunkArray = <T>(items: T[], chunkSize: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
};

const uniqueStrings = (values: string[]) => {
    return Array.from(new Set(values));
};

const resolveMetricKeys = (selection: MetricsSelection) => {
    return selection ?? [...METRICS_KEYS];
};

const buildZeroMetrics = (keys: readonly string[]) => {
    const metrics: Record<string, number> = {};
    for (const key of keys) {
        metrics[key] = 0;
    }
    return metrics;
};

const normalizeMetrics = (value: MetricRecord, keys: readonly string[]) => {
    const metrics: Record<string, number> = {};
    for (const key of keys) {
        const raw = value[key];
        metrics[key] = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    }
    return metrics;
};

const sumMetrics = (values: MetricRecord[]) => {
    const totals: Record<string, number> = buildZeroMetrics(METRICS_KEYS);
    for (const metrics of values) {
        for (const key of METRICS_KEYS) {
            const raw = metrics[key];
            if (typeof raw === 'number' && Number.isFinite(raw)) {
                totals[key] += raw;
            }
        }
    }
    return totals;
};

type ApiClient = ReturnType<typeof createApiClient>;
type RequiredCliConfig = ReturnType<typeof requireCliConfig>;
type CampaignSearchState = 'ENABLED' | 'PAUSED' | 'ARCHIVED' | 'OTHER' | 'ALL';
type MetricsBucket = (typeof METRICS_BUCKETS)[number];
type MetricsSelection = (typeof METRICS_KEYS)[number][] | undefined;
type AsinsTreeOutput = Awaited<ReturnType<ApiClient['asins/get']['query']>>;
type CampaignListItem = Awaited<ReturnType<ApiClient['campaigns/list']['query']>>['items'][number];
type CampaignMetricsTableItem = Awaited<ReturnType<ApiClient['metrics/table/campaigns']['query']>>['items'][number];
type AdGroupMetricsTableItem = Awaited<ReturnType<ApiClient['metrics/table/ad-groups']['query']>>['items'][number];
type TargetMetricsTableItem = Awaited<ReturnType<ApiClient['metrics/table/targets']['query']>>['items'][number];
type AdMetricsTableItem = Awaited<ReturnType<ApiClient['metrics/table/ads']['query']>>['items'][number];
type MetricRecord = Record<string, number | null | undefined>;

type CliConfig = {
    baseUrl?: string;
    apiKey?: string;
    accountId?: string;
    countryCode?: string;
    range?: string;
};

type ParsedFlags = Record<string, string | boolean | string[]> & {
    help?: boolean;
};

const buildHelpContext = async () => {
    const version = await resolveCliVersion();
    const sha = resolveCliSha();
    const config = await loadConfig();
    const configSummary = formatConfigSummary(config);
    return { version, sha, configSummary };
};

const resolveCliVersion = async () => {
    try {
        const pkgUrl = new URL('../package.json', import.meta.url);
        const raw = await readFile(pkgUrl, 'utf8');
        const parsed = JSON.parse(raw) as { version?: string };
        return parsed.version ?? 'dev';
    } catch {
        return 'dev';
    }
};

const resolveCliSha = () => {
    const envSha = process.env.BB_CLI_SHA ?? process.env.GIT_SHA ?? process.env.COMMIT_SHA;
    if (envSha) {
        return envSha.slice(0, 12);
    }
    return tryGetGitSha();
};

const tryGetGitSha = () => {
    try {
        // Best-effort only; `bb` may be running outside a git checkout.
        const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
        if (result.status !== 0) {
            return undefined;
        }
        return result.stdout.trim() || undefined;
    } catch {
        return undefined;
    }
};

const formatConfigSummary = (config: CliConfig) => {
    const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    const accountId = config.accountId;
    const accountCountry = config.countryCode?.toUpperCase();
    const accountSummary = accountId ? `account ${truncateAccountId(accountId)}${accountCountry ? ` (${accountCountry})` : ''}` : 'account not set';
    return `${accountSummary}, base-url ${baseUrl}`;
};

const truncateAccountId = (accountId: string) => {
    if (accountId.length <= 20) {
        return accountId;
    }
    return `${accountId.slice(0, 16)}...${accountId.slice(-4)}`;
};

await main().catch(async error => {
    if (isCliUsageError(error)) {
        const helpContext = await buildHelpContext();
        process.stderr.write(`Error: ${error.message}\n\n`);
        process.stderr.write(renderHelp(error.topicKey, helpContext));
        process.exit(error.exitCode);
    }

    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? withTransportHint(error.message) : error }, null, 2));
    process.exit(1);
});
