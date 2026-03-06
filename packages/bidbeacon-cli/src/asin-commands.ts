import type { BidBeaconClient, CliRouterOutputs } from '@bidbeacon/http-client';
import { getTimezoneForCountry } from './timezones';

const BASE_METRIC_KEYS = ['impressions', 'clicks', 'spend', 'purchases', 'sales'] as const;
const MAX_AD_IDS_PER_REQUEST = 200;

export type MetricKey = 'impressions' | 'clicks' | 'spend' | 'purchases' | 'sales' | 'acos' | 'cpc' | 'ctr' | 'roas';
export type MetricsEntity = 'campaigns' | 'ad-groups' | 'ads' | 'targets';
export type MetricsSelection = readonly MetricKey[];
export type AsinStateFilter = 'ENABLED' | 'PAUSED' | 'ARCHIVED' | 'OTHER' | 'ALL';
export type AsinTreeDepth = 'campaign' | 'ad-group' | 'target' | 'ad';
export type AsinOverviewDepth = 'campaign' | 'ad-group' | 'ad';
export type RequiredCliConfig = {
    accountId: string;
    countryCode: string;
    range: string;
};

type AsinCommandsClient = Pick<BidBeaconClient, 'asins/get' | 'metrics/table/ads'>;
type AsinsTreeOutput = CliRouterOutputs['asins/get'];
type AsinCampaign = AsinsTreeOutput['campaigns'][number];
type AsinAdGroup = AsinCampaign['adGroups'][number];
type AsinAd = AsinAdGroup['ads'][number];
type AdsMetricsTableItem = CliRouterOutputs['metrics/table/ads']['items'][number];
type BaseMetrics = Record<(typeof BASE_METRIC_KEYS)[number], number>;

export const getAsinTree = async (client: AsinCommandsClient, config: RequiredCliConfig, asin: string, options: { depth: AsinTreeDepth; stateFilter: AsinStateFilter }) => {
    const tree = await getFilteredAsinTree(client, config, asin, options.stateFilter);
    const scope = collectAsinScope(tree);

    return {
        asin,
        context: {
            accountId: config.accountId,
            countryCode: config.countryCode,
            depth: options.depth,
            stateFilter: options.stateFilter,
            scope: buildAsinScopeCounts(tree, scope),
        },
        campaigns: selectAsinTreeDepth(tree.campaigns, options.depth),
    };
};

export const getAsinOverview = async (
    client: AsinCommandsClient,
    config: RequiredCliConfig,
    asin: string,
    options: { range?: string; metrics: MetricsSelection; depth: AsinOverviewDepth; stateFilter: AsinStateFilter }
) => {
    const tree = await getFilteredAsinTree(client, config, asin, options.stateFilter);
    const scope = collectAsinScope(tree);
    const requestedRange = options.range ?? config.range;
    const rangeSource = options.range ? 'flag' : 'config';
    const timezone = getTimezoneForCountry(config.countryCode);
    const adMetricsById = await queryAsinAdMetrics(client, config, scope.adIds, options.range);
    const campaigns = tree.campaigns.map(campaign => buildCampaignOverview(campaign, adMetricsById, options.metrics, options.depth));
    const totals = selectMetrics(
        campaigns.reduce((totals, campaign) => sumBaseMetrics(totals, campaign.baseMetrics), buildEmptyBaseMetrics()),
        options.metrics
    );

    return {
        asin,
        context: {
            accountId: config.accountId,
            countryCode: config.countryCode,
            range: requestedRange,
            rangeSource,
            timezone,
            depth: options.depth,
            stateFilter: options.stateFilter,
            metrics: options.metrics,
            scope: buildAsinScopeCounts(tree, scope),
        },
        summary: {
            totals,
            campaigns: campaigns.map(({ baseMetrics, ...campaign }) => campaign),
        },
    };
};

export const resolveAsinMetricsScope = async (client: Pick<BidBeaconClient, 'asins/get'>, config: RequiredCliConfig, asin: string, entity: MetricsEntity, stateFilter: AsinStateFilter) => {
    const tree = await getFilteredAsinTree(client, config, asin, stateFilter);
    const scope = collectAsinScope(tree);
    if (entity === 'campaigns') {
        return { ids: scope.campaignIds, scope: buildAsinScopeCounts(tree, scope) };
    }
    if (entity === 'ad-groups') {
        return { ids: scope.adGroupIds, scope: buildAsinScopeCounts(tree, scope) };
    }
    if (entity === 'ads') {
        return { ids: scope.adIds, scope: buildAsinScopeCounts(tree, scope) };
    }
    return { ids: scope.targetIds, scope: buildAsinScopeCounts(tree, scope) };
};

const getFilteredAsinTree = async (client: Pick<BidBeaconClient, 'asins/get'>, config: RequiredCliConfig, asin: string, stateFilter: AsinStateFilter) => {
    const tree = await client['asins/get'].query({ config, asin });
    return filterAsinTreeByState(tree, stateFilter);
};

const filterAsinTreeByState = (tree: AsinsTreeOutput, stateFilter: AsinStateFilter): AsinsTreeOutput => {
    if (stateFilter === 'ALL') {
        return tree;
    }

    return {
        campaigns: tree.campaigns.flatMap(campaign => {
            if (!matchesState(campaign.state, stateFilter)) {
                return [];
            }

            const adGroups = campaign.adGroups.flatMap(adGroup => {
                if (!matchesState(adGroup.state, stateFilter)) {
                    return [];
                }

                const ads = adGroup.ads.filter(ad => matchesState(ad.state, stateFilter));
                if (ads.length === 0) {
                    return [];
                }

                return [
                    {
                        ...adGroup,
                        targets: adGroup.targets.filter(target => matchesState(target.state, stateFilter)),
                        ads,
                    },
                ];
            });

            if (adGroups.length === 0) {
                return [];
            }

            return [
                {
                    ...campaign,
                    targets: campaign.targets.filter(target => matchesState(target.state, stateFilter)),
                    adGroups,
                },
            ];
        }),
    };
};

const matchesState = (value: string, stateFilter: AsinStateFilter) => {
    return stateFilter === 'ALL' || value === stateFilter;
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

const buildAsinScopeCounts = (tree: AsinsTreeOutput, scope: ReturnType<typeof collectAsinScope>) => {
    return {
        campaigns: tree.campaigns.length,
        adGroups: scope.adGroupIds.length,
        ads: scope.adIds.length,
        targets: scope.targetIds.length,
    };
};

const selectAsinTreeDepth = (campaigns: AsinsTreeOutput['campaigns'], depth: AsinTreeDepth) => {
    if (depth === 'ad') {
        return campaigns;
    }
    if (depth === 'campaign') {
        return campaigns.map(campaign => ({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            state: campaign.state,
            creationDateTime: campaign.creationDateTime,
        }));
    }
    if (depth === 'ad-group') {
        return campaigns.map(campaign => ({
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            state: campaign.state,
            creationDateTime: campaign.creationDateTime,
            adGroups: campaign.adGroups.map(adGroup => ({
                adGroupId: adGroup.adGroupId,
                campaignId: adGroup.campaignId,
                name: adGroup.name,
                state: adGroup.state,
                defaultBid: adGroup.defaultBid,
            })),
        }));
    }
    return campaigns.map(campaign => ({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        state: campaign.state,
        creationDateTime: campaign.creationDateTime,
        targets: campaign.targets,
        adGroups: campaign.adGroups.map(adGroup => ({
            adGroupId: adGroup.adGroupId,
            campaignId: adGroup.campaignId,
            name: adGroup.name,
            state: adGroup.state,
            defaultBid: adGroup.defaultBid,
            targets: adGroup.targets,
        })),
    }));
};

const queryAsinAdMetrics = async (client: Pick<BidBeaconClient, 'metrics/table/ads'>, config: RequiredCliConfig, ids: string[], range: string | undefined) => {
    if (ids.length === 0) {
        return new Map<string, BaseMetrics>();
    }

    const chunks = chunkArray(ids, MAX_AD_IDS_PER_REQUEST);
    const results = await Promise.all(
        chunks.map(chunkIds =>
            client['metrics/table/ads'].query({
                config,
                ids: chunkIds,
                range,
                metrics: [...BASE_METRIC_KEYS],
                limit: MAX_AD_IDS_PER_REQUEST,
            })
        )
    );

    const metricsByAdId = new Map<string, BaseMetrics>();
    for (const result of results) {
        for (const item of result.items) {
            metricsByAdId.set(item.adId, extractBaseMetrics(item.metrics));
        }
    }
    return metricsByAdId;
};

const buildCampaignOverview = (campaign: AsinCampaign, adMetricsById: Map<string, BaseMetrics>, metricsSelection: MetricsSelection, depth: AsinOverviewDepth) => {
    const adGroups = campaign.adGroups.map(adGroup => buildAdGroupOverview(adGroup, adMetricsById, metricsSelection, depth));
    const baseMetrics = adGroups.reduce((totals, adGroup) => sumBaseMetrics(totals, adGroup.baseMetrics), buildEmptyBaseMetrics());

    return {
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        state: campaign.state,
        creationDateTime: campaign.creationDateTime,
        metrics: selectMetrics(baseMetrics, metricsSelection),
        ...(depth === 'campaign' ? {} : { adGroups: adGroups.map(({ baseMetrics: adGroupBaseMetrics, ...adGroup }) => adGroup) }),
        baseMetrics,
    };
};

const buildAdGroupOverview = (adGroup: AsinAdGroup, adMetricsById: Map<string, BaseMetrics>, metricsSelection: MetricsSelection, depth: AsinOverviewDepth) => {
    const ads = adGroup.ads.map(ad => buildAdOverview(ad, adMetricsById, metricsSelection));
    const baseMetrics = ads.reduce((totals, ad) => sumBaseMetrics(totals, ad.baseMetrics), buildEmptyBaseMetrics());

    return {
        adGroupId: adGroup.adGroupId,
        campaignId: adGroup.campaignId,
        name: adGroup.name,
        state: adGroup.state,
        defaultBid: adGroup.defaultBid,
        metrics: selectMetrics(baseMetrics, metricsSelection),
        ...(depth === 'ad'
            ? {
                  ads: ads.map(({ baseMetrics: adBaseMetrics, ...ad }) => ad),
              }
            : {}),
        baseMetrics,
    };
};

const buildAdOverview = (ad: AsinAd, adMetricsById: Map<string, BaseMetrics>, metricsSelection: MetricsSelection) => {
    const baseMetrics = adMetricsById.get(ad.adId) ?? buildEmptyBaseMetrics();

    return {
        adId: ad.adId,
        campaignId: ad.campaignId,
        adGroupId: ad.adGroupId,
        state: ad.state,
        productIdType: ad.productIdType,
        productId: ad.productId,
        productTitle: ad.productTitle,
        metrics: selectMetrics(baseMetrics, metricsSelection),
        baseMetrics,
    };
};

const extractBaseMetrics = (metrics: AdsMetricsTableItem['metrics']): BaseMetrics => {
    return {
        impressions: safeMetricValue(metrics.impressions),
        clicks: safeMetricValue(metrics.clicks),
        spend: safeMetricValue(metrics.spend),
        purchases: safeMetricValue(metrics.purchases),
        sales: safeMetricValue(metrics.sales),
    };
};

const safeMetricValue = (value: number | null) => {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const buildEmptyBaseMetrics = (): BaseMetrics => ({
    impressions: 0,
    clicks: 0,
    spend: 0,
    purchases: 0,
    sales: 0,
});

const sumBaseMetrics = (left: BaseMetrics, right: BaseMetrics): BaseMetrics => ({
    impressions: left.impressions + right.impressions,
    clicks: left.clicks + right.clicks,
    spend: left.spend + right.spend,
    purchases: left.purchases + right.purchases,
    sales: left.sales + right.sales,
});

const buildMetricsValues = (metrics: BaseMetrics): Record<MetricKey, number | null> => {
    const { impressions, clicks, spend, purchases, sales } = metrics;

    return {
        impressions,
        clicks,
        spend,
        purchases,
        sales,
        acos: sales > 0 ? spend / sales : null,
        cpc: clicks > 0 ? spend / clicks : null,
        ctr: impressions > 0 ? clicks / impressions : null,
        roas: spend > 0 ? sales / spend : null,
    };
};

const selectMetrics = (metrics: BaseMetrics, selection: MetricsSelection) => {
    const allMetrics = buildMetricsValues(metrics);
    const selectedMetrics: Partial<Record<MetricKey, number | null>> = {};

    for (const key of selection) {
        selectedMetrics[key] = allMetrics[key];
    }

    return selectedMetrics;
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
