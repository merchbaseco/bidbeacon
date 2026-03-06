import { describe, expect, it, vi } from 'vitest';
import type { BidBeaconClient, CliRouterOutputs } from '../../packages/bidbeacon-api-client/src/index';
import { getAsinOverview, getAsinTree, resolveAsinMetricsScope } from '../../packages/bidbeacon-cli/src/asin-commands';

const CLI_CONFIG = {
    accountId: 'account-1',
    countryCode: 'US',
    range: '30d',
};

describe('asin commands', () => {
    it('defaults tree scope to enabled entities only', async () => {
        const client = createMockClient({
            tree: buildAsinTree({
                campaigns: [
                    {
                        campaignId: 'campaign-enabled',
                        campaignName: 'Enabled campaign',
                        state: 'ENABLED',
                        creationDateTime: '2026-03-01T00:00:00.000Z',
                        targets: [buildTarget({ targetId: 'campaign-target-enabled', state: 'ENABLED' }), buildTarget({ targetId: 'campaign-target-paused', state: 'PAUSED' })],
                        adGroups: [
                            {
                                adGroupId: 'ad-group-enabled',
                                campaignId: 'campaign-enabled',
                                name: 'Enabled ad group',
                                state: 'ENABLED',
                                defaultBid: 1.2,
                                targets: [buildTarget({ targetId: 'ad-group-target-enabled', state: 'ENABLED' }), buildTarget({ targetId: 'ad-group-target-paused', state: 'PAUSED' })],
                                ads: [
                                    buildAd({ adId: 'ad-enabled', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'ENABLED', productId: 'B000000001' }),
                                    buildAd({ adId: 'ad-paused', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'PAUSED', productId: 'B000000001' }),
                                ],
                            },
                        ],
                    },
                    {
                        campaignId: 'campaign-paused',
                        campaignName: 'Paused campaign',
                        state: 'PAUSED',
                        creationDateTime: '2026-03-02T00:00:00.000Z',
                        targets: [buildTarget({ targetId: 'campaign-target-2', state: 'PAUSED' })],
                        adGroups: [
                            {
                                adGroupId: 'ad-group-paused',
                                campaignId: 'campaign-paused',
                                name: 'Paused ad group',
                                state: 'PAUSED',
                                defaultBid: 1.4,
                                targets: [buildTarget({ targetId: 'ad-group-target-2', state: 'PAUSED' })],
                                ads: [buildAd({ adId: 'ad-paused-2', campaignId: 'campaign-paused', adGroupId: 'ad-group-paused', state: 'PAUSED', productId: 'B000000001' })],
                            },
                        ],
                    },
                ],
            }),
        });

        const data = await getAsinTree(client, CLI_CONFIG, 'B000000001', {
            depth: 'ad',
            stateFilter: 'ENABLED',
        });

        expect(data.context.stateFilter).toBe('ENABLED');
        expect(data.context.scope).toEqual({
            campaigns: 1,
            adGroups: 1,
            ads: 1,
            targets: 2,
        });
        expect(data.campaigns).toHaveLength(1);
        expect(data.campaigns[0]?.campaignId).toBe('campaign-enabled');
        expect(data.campaigns[0]?.targets.map(target => target.targetId)).toEqual(['campaign-target-enabled']);
        expect(data.campaigns[0]?.adGroups[0]?.targets.map(target => target.targetId)).toEqual(['ad-group-target-enabled']);
        expect(data.campaigns[0]?.adGroups[0]?.ads.map(ad => ad.adId)).toEqual(['ad-enabled']);
    });

    it('aggregates overview metrics from matched ads only and preserves the hierarchy', async () => {
        const adsQuery = vi.fn(async ({ ids }: { ids?: string[] }) => {
            return {
                totals: buildMetricTotals({ impressions: 9999, clicks: 999, spend: 999, purchases: 999, sales: 999 }),
                items: (ids ?? []).map(adId => {
                    if (adId === 'ad-enabled') {
                        return buildAdMetricsItem({
                            adId,
                            campaignId: 'campaign-enabled',
                            adGroupId: 'ad-group-enabled',
                            campaignName: 'Enabled campaign',
                            adGroupName: 'Enabled ad group',
                            state: 'ENABLED',
                            metrics: { impressions: 100, clicks: 10, spend: 25, purchases: 2, sales: 100 },
                        });
                    }

                    return buildAdMetricsItem({
                        adId,
                        campaignId: 'campaign-enabled',
                        adGroupId: 'ad-group-enabled',
                        campaignName: 'Enabled campaign',
                        adGroupName: 'Enabled ad group',
                        state: 'PAUSED',
                        metrics: { impressions: 500, clicks: 50, spend: 200, purchases: 5, sales: 300 },
                    });
                }),
                sort: { field: 'spend', direction: 'desc' as const },
            };
        });
        const client = createMockClient({
            tree: buildAsinTree({
                campaigns: [
                    {
                        campaignId: 'campaign-enabled',
                        campaignName: 'Enabled campaign',
                        state: 'ENABLED',
                        creationDateTime: '2026-03-01T00:00:00.000Z',
                        targets: [],
                        adGroups: [
                            {
                                adGroupId: 'ad-group-enabled',
                                campaignId: 'campaign-enabled',
                                name: 'Enabled ad group',
                                state: 'ENABLED',
                                defaultBid: 1.2,
                                targets: [],
                                ads: [
                                    buildAd({ adId: 'ad-enabled', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'ENABLED', productId: 'B000000001', productTitle: 'Live ad' }),
                                    buildAd({ adId: 'ad-paused', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'PAUSED', productId: 'B000000001', productTitle: 'Paused ad' }),
                                ],
                            },
                        ],
                    },
                ],
            }),
            adsQuery,
        });

        const data = await getAsinOverview(client, CLI_CONFIG, 'B000000001', {
            range: '14d',
            metrics: ['spend', 'sales', 'acos', 'cpc', 'ctr', 'roas'],
            depth: 'ad',
            stateFilter: 'ENABLED',
        });

        expect(adsQuery).toHaveBeenCalledTimes(1);
        expect(adsQuery.mock.calls[0]?.[0].ids).toEqual(['ad-enabled']);
        expect(data.context.stateFilter).toBe('ENABLED');
        expect(data.summary.totals).toEqual({
            spend: 25,
            sales: 100,
            acos: 0.25,
            cpc: 2.5,
            ctr: 0.1,
            roas: 4,
        });
        expect(data.summary.campaigns[0]?.metrics).toEqual(data.summary.totals);
        expect(data.summary.campaigns[0]?.adGroups?.[0]?.metrics).toEqual(data.summary.totals);
        expect(data.summary.campaigns[0]?.adGroups?.[0]?.ads).toEqual([
            {
                adId: 'ad-enabled',
                campaignId: 'campaign-enabled',
                adGroupId: 'ad-group-enabled',
                state: 'ENABLED',
                productIdType: 'ASIN',
                productId: 'B000000001',
                productTitle: 'Live ad',
                metrics: {
                    spend: 25,
                    sales: 100,
                    acos: 0.25,
                    cpc: 2.5,
                    ctr: 0.1,
                    roas: 4,
                },
            },
        ]);
    });

    it('recomputes chunked totals from base metrics instead of summing ratios', async () => {
        const adIds = Array.from({ length: 201 }, (_, index) => `ad-${index + 1}`);
        const adsQuery = vi.fn(async ({ ids }: { ids?: string[] }) => {
            return {
                totals: buildMetricTotals({ impressions: 1, clicks: 1, spend: 1, purchases: 1, sales: 1 }),
                items: (ids ?? []).map(adId =>
                    buildAdMetricsItem({
                        adId,
                        campaignId: 'campaign-enabled',
                        adGroupId: 'ad-group-enabled',
                        campaignName: 'Enabled campaign',
                        adGroupName: 'Enabled ad group',
                        state: 'ENABLED',
                        metrics: { impressions: 100, clicks: 10, spend: 5, purchases: 1, sales: 20 },
                    })
                ),
                sort: { field: 'spend', direction: 'desc' as const },
            };
        });
        const client = createMockClient({
            tree: buildAsinTree({
                campaigns: [
                    {
                        campaignId: 'campaign-enabled',
                        campaignName: 'Enabled campaign',
                        state: 'ENABLED',
                        creationDateTime: '2026-03-01T00:00:00.000Z',
                        targets: [],
                        adGroups: [
                            {
                                adGroupId: 'ad-group-enabled',
                                campaignId: 'campaign-enabled',
                                name: 'Enabled ad group',
                                state: 'ENABLED',
                                defaultBid: 1,
                                targets: [],
                                ads: adIds.map(adId =>
                                    buildAd({
                                        adId,
                                        campaignId: 'campaign-enabled',
                                        adGroupId: 'ad-group-enabled',
                                        state: 'ENABLED',
                                        productId: 'B000000001',
                                    })
                                ),
                            },
                        ],
                    },
                ],
            }),
            adsQuery,
        });

        const data = await getAsinOverview(client, CLI_CONFIG, 'B000000001', {
            metrics: ['impressions', 'clicks', 'spend', 'sales', 'acos', 'cpc', 'ctr', 'roas'],
            depth: 'campaign',
            stateFilter: 'ENABLED',
        });

        expect(adsQuery).toHaveBeenCalledTimes(2);
        expect(data.summary.totals).toEqual({
            impressions: 20_100,
            clicks: 2010,
            spend: 1005,
            sales: 4020,
            acos: 0.25,
            cpc: 0.5,
            ctr: 0.1,
            roas: 4,
        });
    });

    it('applies the same enabled-only default to metrics --asin scope resolution', async () => {
        const client = createMockClient({
            tree: buildAsinTree({
                campaigns: [
                    {
                        campaignId: 'campaign-enabled',
                        campaignName: 'Enabled campaign',
                        state: 'ENABLED',
                        creationDateTime: '2026-03-01T00:00:00.000Z',
                        targets: [buildTarget({ targetId: 'campaign-target-enabled', state: 'ENABLED' })],
                        adGroups: [
                            {
                                adGroupId: 'ad-group-enabled',
                                campaignId: 'campaign-enabled',
                                name: 'Enabled ad group',
                                state: 'ENABLED',
                                defaultBid: 1.2,
                                targets: [buildTarget({ targetId: 'ad-group-target-enabled', state: 'ENABLED' }), buildTarget({ targetId: 'ad-group-target-paused', state: 'PAUSED' })],
                                ads: [
                                    buildAd({ adId: 'ad-enabled', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'ENABLED', productId: 'B000000001' }),
                                    buildAd({ adId: 'ad-paused', campaignId: 'campaign-enabled', adGroupId: 'ad-group-enabled', state: 'PAUSED', productId: 'B000000001' }),
                                ],
                            },
                        ],
                    },
                ],
            }),
        });

        const enabledScope = await resolveAsinMetricsScope(client, CLI_CONFIG, 'B000000001', 'targets', 'ENABLED');
        const allScope = await resolveAsinMetricsScope(client, CLI_CONFIG, 'B000000001', 'targets', 'ALL');

        expect(enabledScope.ids).toEqual(['campaign-target-enabled', 'ad-group-target-enabled']);
        expect(allScope.ids).toEqual(['campaign-target-enabled', 'ad-group-target-enabled', 'ad-group-target-paused']);
    });
});

const createMockClient = (input: { tree: CliRouterOutputs['asins/get']; adsQuery?: ReturnType<typeof vi.fn> }) => {
    return {
        'asins/get': {
            query: vi.fn(async () => input.tree),
        },
        'metrics/table/ads': {
            query:
                input.adsQuery ??
                vi.fn(async () => ({
                    totals: buildMetricTotals({ impressions: 0, clicks: 0, spend: 0, purchases: 0, sales: 0 }),
                    items: [],
                    sort: { field: 'spend', direction: 'desc' as const },
                })),
        },
    } satisfies Pick<BidBeaconClient, 'asins/get' | 'metrics/table/ads'>;
};

const buildAsinTree = (tree: CliRouterOutputs['asins/get']) => {
    return tree;
};

const buildAd = (input: { adId: string; campaignId: string; adGroupId: string; state: 'ENABLED' | 'PAUSED' | 'ARCHIVED' | 'OTHER'; productId: string; productTitle?: string | null }) => {
    return {
        adId: input.adId,
        campaignId: input.campaignId,
        adGroupId: input.adGroupId,
        state: input.state,
        productIdType: 'ASIN' as const,
        productId: input.productId,
        productTitle: input.productTitle ?? null,
    };
};

const buildTarget = (input: { targetId: string; state: 'ENABLED' | 'PAUSED' | 'ARCHIVED' | 'OTHER' }) => {
    return {
        targetId: input.targetId,
        campaignId: 'campaign-enabled',
        adGroupId: 'ad-group-enabled',
        negative: false,
        state: input.state,
        bid: 1,
        type: 'KEYWORD' as const,
        targetMatchType: 'EXACT' as const,
        keyword: 'lepricorn',
        keywordMatchType: 'EXACT' as const,
        productId: null,
        productMatchType: null,
    };
};

const buildAdMetricsItem = (input: {
    adId: string;
    campaignId: string;
    adGroupId: string;
    campaignName: string;
    adGroupName: string;
    state: 'ENABLED' | 'PAUSED' | 'ARCHIVED' | 'OTHER';
    metrics: {
        impressions: number;
        clicks: number;
        spend: number;
        purchases: number;
        sales: number;
    };
}) => {
    return {
        adId: input.adId,
        campaignId: input.campaignId,
        campaignName: input.campaignName,
        adGroupId: input.adGroupId,
        adGroupName: input.adGroupName,
        state: input.state,
        productId: 'B000000001',
        metrics: buildMetricTotals(input.metrics),
    };
};

const buildMetricTotals = (metrics: { impressions: number; clicks: number; spend: number; purchases: number; sales: number }) => {
    return {
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        purchases: metrics.purchases,
        sales: metrics.sales,
        acos: metrics.sales > 0 ? metrics.spend / metrics.sales : null,
        cpc: metrics.clicks > 0 ? metrics.spend / metrics.clicks : null,
        ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : null,
        roas: metrics.spend > 0 ? metrics.sales / metrics.spend : null,
    };
};
