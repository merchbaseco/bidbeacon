import { TRPCError } from '@trpc/server';
import { addDays, addHours, format, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { and, asc, desc, eq, gte, ilike, inArray, lt, lte, ne, or, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { ApiRegion } from '@/amazon-ads/config';
import type { Context } from '@/api/context';
import { parseNumeric, toMoneyString } from '@/api/routers/ads/shared';
import type {
    adGroupSchema,
    adSchema,
    bidStrategySchema,
    campaignSchema,
    listStateSchema,
    metricsBucketSchema,
    metricsFiltersSchema,
    metricsGranularitySchema,
    metricsKeySchema,
    metricsPointSchema,
    metricsSelectionSchema,
    metricsTableAdGroupsOutputSchema,
    metricsTableAdsOutputSchema,
    metricsTableCampaignsOutputSchema,
    metricsTableSortFieldSchema,
    metricsTableTargetsOutputSchema,
    metricsTotalsSchema,
    targetSchema,
} from '@/api/schemas/cli';
import { db } from '@/db/index';
import { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, target } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';

export type CliConfig = {
    accountId: string;
    countryCode?: string;
    range: string;
};

type ApiContext = Context & {
    assertAccountAccess: (accountId: string) => void;
};

type ListOptions = {
    state?: ListState;
    campaignId?: string;
    adGroupId?: string;
};

export type AccountContext = {
    accountId: string;
    countryCode: string;
    profileId: number;
    timezone: string;
    region: ApiRegion;
};

export type CampaignShape = z.infer<typeof campaignSchema>;
export type AdGroupShape = z.infer<typeof adGroupSchema>;
export type AdShape = z.infer<typeof adSchema>;
export type TargetShape = z.infer<typeof targetSchema>;
export type MetricsTotals = z.infer<typeof metricsTotalsSchema>;
export type MetricsPoint = z.infer<typeof metricsPointSchema>;
export type BidStrategy = z.infer<typeof bidStrategySchema>;
export type ListState = z.infer<typeof listStateSchema>;
export type MetricsTableSortField = z.infer<typeof metricsTableSortFieldSchema>;
export type MetricsKey = z.infer<typeof metricsKeySchema>;
export type MetricsGranularity = z.infer<typeof metricsGranularitySchema>;
type MetricsSelection = z.infer<typeof metricsSelectionSchema>;
type MetricsBucket = z.infer<typeof metricsBucketSchema>;
type MetricsFilterInput = NonNullable<z.infer<typeof metricsFiltersSchema>>;
export type MetricsTableSort = {
    field: MetricsTableSortField;
    direction: 'asc' | 'desc';
};
type MetricsDimension = 'campaign' | 'adGroup' | 'ad' | 'target';
type MetricsFilters = {
    campaignId?: string;
    adGroupId?: string;
    ids?: string[];
};

const DAYS_RANGE_REGEX = /^(\d+)d$/;
type MetricsTableOptions = MetricsFilters & {
    sort: MetricsTableSort;
    limit: number;
    offset: number;
};
type MetricsSeriesOptions = {
    scope: MetricsFilters;
    filters?: MetricsFilterInput;
    metrics?: MetricsSelection;
    range?: string;
    bucket?: MetricsBucket;
};
type MetricsTableRequest = MetricsTableOptions & {
    filters?: MetricsFilterInput;
    metrics?: MetricsSelection;
    range?: string;
};
type MetricsTableResult = {
    campaign: z.infer<typeof metricsTableCampaignsOutputSchema>;
    adGroup: z.infer<typeof metricsTableAdGroupsOutputSchema>;
    ad: z.infer<typeof metricsTableAdsOutputSchema>;
    target: z.infer<typeof metricsTableTargetsOutputSchema>;
};

export const assertAccountAccess = (ctx: ApiContext, config: CliConfig) => {
    ctx.assertAccountAccess(config.accountId);
};

export const resolveAccountContext = async (config: CliConfig): Promise<AccountContext> => {
    const account = await resolveAdvertiserAccount(config);

    if (!account) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Account not found for this API key.',
        });
    }

    const profileId = Number(account.profileId ?? '');
    if (!Number.isFinite(profileId)) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Missing Amazon Ads profile for this account.',
        });
    }

    return {
        accountId: config.accountId,
        countryCode: account.countryCode,
        profileId,
        timezone: getTimezoneForCountry(account.countryCode),
        region: resolveApiRegion(account.countryCode),
    };
};

export const listCampaigns = async (config: CliConfig, options?: ListOptions): Promise<CampaignShape[]> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const stateFilter = resolveListState(options?.state);
    const rows = await db
        .select({
            campaignId: campaign.campaignId,
            name: campaign.name,
            state: campaign.state,
            budgetAmount: campaign.budgetAmount,
            bidStrategy: campaign.bidStrategy,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            portfolioId: sql<string | null>`NULL`.as('portfolioId'),
        })
        .from(campaign)
        .where(and(eq(campaign.accountId, config.accountId), ...(countryCode ? [eq(campaign.countryCode, countryCode)] : []), ...(stateFilter ? [eq(campaign.state, stateFilter)] : [])))
        .orderBy(desc(campaign.lastUpdatedDateTime), campaign.campaignId);

    return rows.map(row => mapCampaignRow(row));
};

export const getCampaign = async (config: CliConfig, campaignId: string): Promise<CampaignShape> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const [row] = await db
        .select({
            campaignId: campaign.campaignId,
            name: campaign.name,
            state: campaign.state,
            budgetAmount: campaign.budgetAmount,
            bidStrategy: campaign.bidStrategy,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            portfolioId: sql<string | null>`NULL`.as('portfolioId'),
        })
        .from(campaign)
        .where(and(eq(campaign.accountId, config.accountId), eq(campaign.campaignId, campaignId), ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])))
        .limit(1);

    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Campaign not found.' });
    }

    return mapCampaignRow(row);
};

export const listAdGroups = async (config: CliConfig, options?: ListOptions): Promise<AdGroupShape[]> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const stateFilter = resolveListState(options?.state);
    const rows = await db
        .select({
            adGroupId: adGroup.adGroupId,
            campaignId: adGroup.campaignId,
            name: adGroup.name,
            state: adGroup.state,
            bidAmount: adGroup.bidAmount,
        })
        .from(adGroup)
        .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
        .where(
            and(
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : []),
                ...(options?.campaignId ? [eq(adGroup.campaignId, options.campaignId)] : []),
                ...(stateFilter ? [eq(adGroup.state, stateFilter)] : [])
            )
        )
        .orderBy(desc(adGroup.lastUpdatedDateTime), adGroup.adGroupId);

    return rows.map(row => mapAdGroupRow(row));
};

export const getAdGroup = async (config: CliConfig, adGroupId: string): Promise<AdGroupShape> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const [row] = await db
        .select({
            adGroupId: adGroup.adGroupId,
            campaignId: adGroup.campaignId,
            name: adGroup.name,
            state: adGroup.state,
            bidAmount: adGroup.bidAmount,
        })
        .from(adGroup)
        .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
        .where(and(eq(adGroup.adGroupId, adGroupId), eq(campaign.accountId, config.accountId), ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])))
        .limit(1);

    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ad group not found.' });
    }

    return mapAdGroupRow(row);
};

export const listAds = async (config: CliConfig, options?: ListOptions): Promise<AdShape[]> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const stateFilter = resolveListState(options?.state);
    const rows = await db
        .select({
            adId: ad.adId,
            campaignId: ad.campaignId,
            adGroupId: ad.adGroupId,
            state: ad.state,
            productId: ad.productAsin,
        })
        .from(ad)
        .innerJoin(campaign, eq(ad.campaignId, campaign.campaignId))
        .where(
            and(
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : []),
                ...(options?.campaignId ? [eq(ad.campaignId, options.campaignId)] : []),
                ...(options?.adGroupId ? [eq(ad.adGroupId, options.adGroupId)] : []),
                ...(stateFilter ? [eq(ad.state, stateFilter)] : [])
            )
        )
        .orderBy(desc(ad.lastUpdatedDateTime), ad.adId);

    return rows.map(row => mapAdRow(row));
};

export const getAd = async (config: CliConfig, adId: string): Promise<AdShape> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const [row] = await db
        .select({
            adId: ad.adId,
            campaignId: ad.campaignId,
            adGroupId: ad.adGroupId,
            state: ad.state,
            productId: ad.productAsin,
        })
        .from(ad)
        .innerJoin(campaign, eq(ad.campaignId, campaign.campaignId))
        .where(and(eq(ad.adId, adId), eq(campaign.accountId, config.accountId), ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])))
        .limit(1);

    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ad not found.' });
    }

    return mapAdRow(row);
};

export const listTargets = async (config: CliConfig, options?: ListOptions): Promise<TargetShape[]> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const stateFilter = resolveListState(options?.state);
    const rows = await db
        .select({
            targetId: target.targetId,
            campaignId: target.campaignId,
            adGroupId: target.adGroupId,
            state: target.state,
            bidAmount: target.bidAmount,
            targetType: target.targetType,
            targetKeyword: target.targetKeyword,
            targetMatchType: target.targetMatchType,
            targetAsin: target.targetAsin,
        })
        .from(target)
        .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
        .where(
            and(
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : []),
                inArray(target.targetType, ['KEYWORD', 'PRODUCT']),
                ...(options?.campaignId ? [eq(target.campaignId, options.campaignId)] : []),
                ...(options?.adGroupId ? [eq(target.adGroupId, options.adGroupId)] : []),
                ...(stateFilter ? [eq(target.state, stateFilter)] : [])
            )
        )
        .orderBy(desc(target.lastUpdatedDateTime), target.targetId);

    return rows.map(row => mapTargetRow(row));
};

export const getTarget = async (config: CliConfig, targetId: string): Promise<TargetShape> => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const [row] = await db
        .select({
            targetId: target.targetId,
            campaignId: target.campaignId,
            adGroupId: target.adGroupId,
            state: target.state,
            bidAmount: target.bidAmount,
            targetType: target.targetType,
            targetKeyword: target.targetKeyword,
            targetMatchType: target.targetMatchType,
            targetAsin: target.targetAsin,
        })
        .from(target)
        .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
        .where(and(eq(target.targetId, targetId), eq(campaign.accountId, config.accountId), ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])))
        .limit(1);

    if (!row) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Target not found.' });
    }

    return mapTargetRow(row);
};

export const updateCampaignRow = async (
    campaignId: string,
    updates: Partial<{
        state: string;
        name: string;
        budget: number;
        bidStrategy: BidStrategy | null;
        startDateTime: string | null;
        endDateTime: string | null;
        portfolioId: string | null;
    }>
) => {
    const values: Record<string, unknown> = {};
    if (updates.state) {
        values.state = updates.state;
    }
    if (updates.name) {
        values.name = updates.name;
    }
    if (updates.bidStrategy !== undefined) {
        values.bidStrategy = updates.bidStrategy;
    }
    if (updates.budget !== undefined) {
        values.budgetAmount = toMoneyString(updates.budget);
    }
    if (updates.startDateTime) {
        values.startDate = updates.startDateTime.slice(0, 10);
    }
    if (updates.endDateTime !== undefined) {
        values.endDate = updates.endDateTime ? updates.endDateTime.slice(0, 10) : null;
    }
    if (Object.keys(values).length === 0) {
        return;
    }
    values.lastUpdatedDateTime = new Date();
    await db.update(campaign).set(values).where(eq(campaign.campaignId, campaignId));
};

export const updateAdGroupRow = async (adGroupId: string, updates: Partial<{ state: string; name: string; defaultBid: number }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) {
        values.state = updates.state;
    }
    if (updates.name) {
        values.name = updates.name;
    }
    if (updates.defaultBid !== undefined) {
        values.bidAmount = toMoneyString(updates.defaultBid);
    }
    if (Object.keys(values).length === 0) {
        return;
    }
    values.lastUpdatedDateTime = new Date();
    await db.update(adGroup).set(values).where(eq(adGroup.adGroupId, adGroupId));
};

export const updateAdRow = async (adId: string, updates: Partial<{ state: string }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) {
        values.state = updates.state;
    }
    if (Object.keys(values).length === 0) {
        return;
    }
    values.lastUpdatedDateTime = new Date();
    await db.update(ad).set(values).where(eq(ad.adId, adId));
};

export const updateTargetRow = async (targetId: string, updates: Partial<{ state: string; bid: number }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) {
        values.state = updates.state;
    }
    if (updates.bid !== undefined) {
        values.bidAmount = toMoneyString(updates.bid);
    }
    if (Object.keys(values).length === 0) {
        return;
    }
    values.lastUpdatedDateTime = new Date();
    await db.update(target).set(values).where(eq(target.targetId, targetId));
};

export const getMetricsSeries = async (config: CliConfig, dimension: MetricsDimension, options: MetricsSeriesOptions) => {
    const account = await resolveAdvertiserAccount(config);

    if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found.' });
    }

    const timezone = getTimezoneForCountry(account.countryCode);
    const rangeValue = resolveRangeOverride(config.range, options.range);
    const range = parseConfigRange(rangeValue, timezone);
    const granularity = resolveMetricsGranularity(options.bucket, range);
    const scopedIds = await resolveFilteredIds(config, dimension, range, options);

    if (scopedIds && scopedIds.length === 0) {
        const empty = buildEmptyMetrics();
        return {
            totals: selectMetrics(empty, options.metrics),
            series: buildEmptySeries(range, timezone, options.metrics, granularity),
            granularity,
            timezone,
            range: { startDate: range.startDate, endDate: range.endDate },
        };
    }

    const scope: MetricsFilters = {
        ...options.scope,
        ids: mergeIds(options.scope.ids, scopedIds),
    };

    if (granularity === 'hour') {
        const output = await getHourlyMetrics(config.accountId, dimension, range.startUtc, range.endExclusiveUtc, scope);
        return {
            totals: selectMetrics(output.totals, options.metrics),
            series: output.series.map(point => ({
                ...point,
                metrics: selectMetrics(point.metrics, options.metrics),
            })),
            granularity,
            timezone,
            range: { startDate: range.startDate, endDate: range.endDate },
        };
    }

    const output = await getDailyMetrics(config.accountId, dimension, range.startDate, range.endDate, timezone, scope, granularity);
    return {
        totals: selectMetrics(output.totals, options.metrics),
        series: output.series.map(point => ({
            ...point,
            metrics: selectMetrics(point.metrics, options.metrics),
        })),
        granularity,
        timezone,
        range: { startDate: range.startDate, endDate: range.endDate },
    };
};

export async function getMetricsTable(config: CliConfig, dimension: 'campaign', options: MetricsTableRequest): Promise<MetricsTableResult['campaign']>;
export async function getMetricsTable(config: CliConfig, dimension: 'adGroup', options: MetricsTableRequest): Promise<MetricsTableResult['adGroup']>;
export async function getMetricsTable(config: CliConfig, dimension: 'ad', options: MetricsTableRequest): Promise<MetricsTableResult['ad']>;
export async function getMetricsTable(config: CliConfig, dimension: 'target', options: MetricsTableRequest): Promise<MetricsTableResult['target']>;
export async function getMetricsTable(config: CliConfig, dimension: MetricsDimension, options: MetricsTableRequest): Promise<MetricsTableResult[MetricsDimension]> {
    const account = await resolveAdvertiserAccount(config);

    if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found.' });
    }

    const timezone = getTimezoneForCountry(account.countryCode);
    const rangeValue = resolveRangeOverride(config.range, options.range);
    const range = parseConfigRange(rangeValue, timezone);
    const scopedIds = await resolveFilteredIds(config, dimension, range, {
        scope: options,
        filters: options.filters,
        metrics: options.metrics,
    });

    if (scopedIds && scopedIds.length === 0) {
        const empty = buildEmptyMetrics();
        return {
            totals: selectMetrics(empty, options.metrics),
            items: [],
            sort: options.sort,
        };
    }

    const scope: MetricsTableOptions = {
        campaignId: options.campaignId,
        adGroupId: options.adGroupId,
        ids: mergeIds(options.ids, scopedIds),
        sort: options.sort,
        limit: options.limit,
        offset: options.offset,
    };

    if (range.useHourly) {
        const output = await getHourlyMetricsTable(config.accountId, dimension, range.startUtc, range.endExclusiveUtc, scope);
        return {
            totals: selectMetrics(output.totals, options.metrics),
            items: output.items.map(item => ({
                ...item,
                metrics: selectMetrics(item.metrics, options.metrics),
            })),
            sort: output.sort,
        } as MetricsTableResult[MetricsDimension];
    }

    const output = await getDailyMetricsTable(config.accountId, dimension, range.startDate, range.endDate, scope);
    return {
        totals: selectMetrics(output.totals, options.metrics),
        items: output.items.map(item => ({
            ...item,
            metrics: selectMetrics(item.metrics, options.metrics),
        })),
        sort: output.sort,
    } as MetricsTableResult[MetricsDimension];
}

export const resolveProductIdType = (value: string | null) => {
    if (!value) {
        return 'ASIN' as const;
    }
    return 'ASIN' as const;
};

export const mapCampaignFromApi = (campaignData: Record<string, unknown>): CampaignShape => {
    const budgets = (campaignData.budgets as Record<string, unknown>[] | undefined) ?? [];
    const budgetValue = extractBudgetValue(budgets[0] ?? null) ?? 0;
    const optimizations = campaignData.optimizations as Record<string, unknown> | undefined;
    const bidSettings = optimizations?.bidSettings as Record<string, unknown> | undefined;

    return {
        campaignId: String(campaignData.campaignId ?? ''),
        name: String(campaignData.name ?? ''),
        state: String(campaignData.state ?? 'PAUSED') as CampaignShape['state'],
        budget: budgetValue,
        bidStrategy: (bidSettings?.bidStrategy as CampaignShape['bidStrategy']) ?? null,
        startDateTime: campaignData.startDateTime ? String(campaignData.startDateTime) : null,
        endDateTime: campaignData.endDateTime ? String(campaignData.endDateTime) : null,
        portfolioId: campaignData.portfolioId ? String(campaignData.portfolioId) : null,
    };
};

export const mapAdGroupFromApi = (adGroupData: Record<string, unknown>): AdGroupShape => {
    const bid = adGroupData.bid as Record<string, unknown> | undefined;
    const defaultBid = bid?.defaultBid ? Number(bid.defaultBid) : 0;

    return {
        adGroupId: String(adGroupData.adGroupId ?? ''),
        campaignId: String(adGroupData.campaignId ?? ''),
        name: String(adGroupData.name ?? ''),
        state: String(adGroupData.state ?? 'PAUSED') as AdGroupShape['state'],
        defaultBid,
    };
};

export const mapAdFromApi = (adData: Record<string, unknown>): AdShape => {
    const creative = adData.creative as Record<string, unknown> | undefined;
    const productCreative = creative?.productCreative as Record<string, unknown> | undefined;
    const productSettings = productCreative?.productCreativeSettings as Record<string, unknown> | undefined;
    const advertisedProduct = productSettings?.advertisedProduct as Record<string, unknown> | undefined;

    return {
        adId: String(adData.adId ?? ''),
        campaignId: String(adData.campaignId ?? ''),
        adGroupId: String(adData.adGroupId ?? ''),
        state: String(adData.state ?? 'PAUSED') as AdShape['state'],
        productIdType: String(advertisedProduct?.productIdType ?? 'ASIN') as AdShape['productIdType'],
        productId: String(advertisedProduct?.productId ?? ''),
    };
};

export const mapTargetFromApi = (targetData: Record<string, unknown>): TargetShape => {
    const bid = targetData.bid as Record<string, unknown> | undefined;
    const bidValue = bid?.bid ? Number(bid.bid) : null;
    const targetDetails = targetData.targetDetails as Record<string, unknown> | undefined;
    const keywordTarget = targetDetails?.keywordTarget as Record<string, unknown> | undefined;
    const productTarget = targetDetails?.productTarget as Record<string, unknown> | undefined;
    const product = productTarget?.product as Record<string, unknown> | undefined;

    if (keywordTarget) {
        return {
            targetId: String(targetData.targetId ?? ''),
            campaignId: String(targetData.campaignId ?? ''),
            adGroupId: targetData.adGroupId ? String(targetData.adGroupId) : null,
            state: String(targetData.state ?? 'PAUSED') as TargetShape['state'],
            bid: bidValue,
            type: 'KEYWORD',
            keyword: String(keywordTarget.keyword ?? ''),
            keywordMatchType: String(keywordTarget.matchType ?? 'BROAD') as TargetShape['keywordMatchType'],
            productIdType: null,
            productId: null,
            productMatchType: null,
        };
    }

    return {
        targetId: String(targetData.targetId ?? ''),
        campaignId: String(targetData.campaignId ?? ''),
        adGroupId: targetData.adGroupId ? String(targetData.adGroupId) : null,
        state: String(targetData.state ?? 'PAUSED') as TargetShape['state'],
        bid: bidValue,
        type: 'PRODUCT',
        keyword: null,
        keywordMatchType: null,
        productIdType: String(productTarget?.productIdType ?? 'ASIN') as TargetShape['productIdType'],
        productId: String(product?.productId ?? ''),
        productMatchType: String(productTarget?.matchType ?? 'PRODUCT_EXACT') as TargetShape['productMatchType'],
    };
};

export const buildCampaignBudgetPayload = (budget: number, currencyCode: string) => {
    return [
        {
            budgetType: 'MONETARY',
            recurrenceTimePeriod: 'DAILY',
            budgetValue: {
                monetaryBudgetValue: {
                    monetaryBudget: {
                        value: budget,
                        currencyCode,
                    },
                },
            },
        },
    ];
};

export const buildAdCreativePayload = (productIdType: string, productId: string) => {
    return {
        productCreative: {
            productCreativeSettings: {
                advertisedProduct: {
                    productIdType,
                    productId,
                },
            },
        },
    };
};

export const buildKeywordTargetDetails = (keyword: string, matchType: string) => ({
    keywordTarget: {
        keyword,
        matchType,
    },
});

export const buildProductTargetDetails = (productIdType: string, productId: string, matchType: string) => ({
    productTarget: {
        productIdType,
        matchType,
        product: {
            productId,
        },
    },
});

export const getCurrencyForCountry = (countryCode: string) => {
    switch (countryCode.toUpperCase()) {
        case 'US':
            return 'USD';
        case 'CA':
            return 'CAD';
        case 'MX':
            return 'MXN';
        case 'BR':
            return 'BRL';
        case 'GB':
            return 'GBP';
        case 'IE':
        case 'DE':
        case 'FR':
        case 'ES':
        case 'IT':
        case 'NL':
        case 'BE':
            return 'EUR';
        case 'PL':
            return 'PLN';
        case 'SE':
            return 'SEK';
        case 'JP':
            return 'JPY';
        case 'AU':
            return 'AUD';
        case 'IN':
            return 'INR';
        case 'AE':
            return 'AED';
        case 'EG':
            return 'EGP';
        case 'SA':
            return 'SAR';
        case 'SG':
            return 'SGD';
        default:
            return 'USD';
    }
};

const mapCampaignRow = (row: {
    campaignId: string | null;
    name: string | null;
    state: string | null;
    budgetAmount: string | number | null;
    bidStrategy: string | null;
    startDate: Date | string | null;
    endDate: Date | string | null;
    portfolioId: string | null;
}): CampaignShape => ({
    campaignId: String(row.campaignId ?? ''),
    name: String(row.name ?? ''),
    state: String(row.state ?? 'PAUSED') as CampaignShape['state'],
    budget: parseNumeric(row.budgetAmount) ?? 0,
    bidStrategy: row.bidStrategy ? (String(row.bidStrategy) as CampaignShape['bidStrategy']) : null,
    startDateTime: row.startDate ? toIsoDate(row.startDate) : null,
    endDateTime: row.endDate ? toIsoDate(row.endDate) : null,
    portfolioId: row.portfolioId,
});

const mapAdGroupRow = (row: { adGroupId: string | null; campaignId: string | null; name: string | null; state: string | null; bidAmount: string | number | null }): AdGroupShape => ({
    adGroupId: String(row.adGroupId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    name: String(row.name ?? ''),
    state: String(row.state ?? 'PAUSED') as AdGroupShape['state'],
    defaultBid: parseNumeric(row.bidAmount) ?? 0,
});

const mapAdRow = (row: { adId: string | null; campaignId: string | null; adGroupId: string | null; state: string | null; productId: string | null }): AdShape => ({
    adId: String(row.adId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    adGroupId: String(row.adGroupId ?? ''),
    state: String(row.state ?? 'PAUSED') as AdShape['state'],
    productIdType: resolveProductIdType(row.productId),
    productId: String(row.productId ?? ''),
});

const mapTargetRow = (row: {
    targetId: string | null;
    campaignId: string | null;
    adGroupId: string | null;
    state: string | null;
    bidAmount: string | number | null;
    targetType: string | null;
    targetKeyword: string | null;
    targetMatchType: string | null;
    targetAsin: string | null;
}): TargetShape => {
    const targetType = String(row.targetType ?? 'KEYWORD');
    if (targetType === 'KEYWORD') {
        return {
            targetId: String(row.targetId ?? ''),
            campaignId: String(row.campaignId ?? ''),
            adGroupId: row.adGroupId ? String(row.adGroupId) : null,
            state: String(row.state ?? 'PAUSED') as TargetShape['state'],
            bid: parseNumeric(row.bidAmount),
            type: 'KEYWORD',
            keyword: row.targetKeyword ?? '',
            keywordMatchType: row.targetMatchType ? (String(row.targetMatchType) as TargetShape['keywordMatchType']) : null,
            productIdType: null,
            productId: null,
            productMatchType: null,
        };
    }

    return {
        targetId: String(row.targetId ?? ''),
        campaignId: String(row.campaignId ?? ''),
        adGroupId: row.adGroupId ? String(row.adGroupId) : null,
        state: String(row.state ?? 'PAUSED') as TargetShape['state'],
        bid: parseNumeric(row.bidAmount),
        type: 'PRODUCT',
        keyword: null,
        keywordMatchType: null,
        productIdType: resolveProductIdType(row.targetAsin),
        productId: String(row.targetAsin ?? ''),
        productMatchType: null,
    };
};

const resolveListState = (state?: ListState) => {
    if (!state) {
        return 'ENABLED';
    }
    if (state === 'ALL') {
        return null;
    }
    return state;
};

const resolveApiRegion = (countryCode: string): ApiRegion => {
    const code = countryCode.toUpperCase();
    const naCountries = new Set(['US', 'CA', 'MX', 'BR']);
    const euCountries = new Set(['GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'PL', 'TR', 'AE', 'SA', 'EG']);
    const feCountries = new Set(['JP', 'AU', 'IN', 'SG']);

    if (naCountries.has(code)) {
        return 'na';
    }
    if (euCountries.has(code)) {
        return 'eu';
    }
    if (feCountries.has(code)) {
        return 'fe';
    }
    return 'na';
};

const parseConfigRange = (range: string, timezone: string) => {
    const normalized = range.trim().toLowerCase();
    if (normalized === 'today' || normalized === 't') {
        const zonedNow = toZonedTime(new Date(), timezone);
        const dateValue = format(zonedNow, 'yyyy-MM-dd');
        return buildRange(dateValue, dateValue, timezone);
    }
    if (normalized === 'yesterday' || normalized === 'y') {
        const zonedNow = toZonedTime(new Date(), timezone);
        const dateValue = format(addDays(startOfDay(zonedNow), -1), 'yyyy-MM-dd');
        return buildRange(dateValue, dateValue, timezone);
    }

    if (normalized === 'week' || normalized === 'w') {
        return parseConfigRange('7d', timezone);
    }
    if (normalized === 'month' || normalized === 'm') {
        return parseConfigRange('30d', timezone);
    }

    if (range.includes('..')) {
        const [start, end] = range.split('..');
        const startDate = normalizeDate(start);
        const endDate = normalizeDate(end);
        return buildRange(startDate, endDate, timezone);
    }

    const match = range.trim().match(DAYS_RANGE_REGEX);
    if (!match) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid range format.' });
    }

    const days = Number(match[1]);
    if (!Number.isFinite(days) || days <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid range days.' });
    }

    const zonedNow = toZonedTime(new Date(), timezone);
    const endDate = format(zonedNow, 'yyyy-MM-dd');
    const startDateValue = addDays(startOfDay(zonedNow), -(days - 1));
    const startDate = format(startDateValue, 'yyyy-MM-dd');

    return buildRange(startDate, endDate, timezone);
};

const resolveRangeOverride = (defaultRange: string, override?: string) => {
    const normalized = override?.trim();
    return normalized ? normalized : defaultRange;
};

const resolveMetricsGranularity = (bucket: MetricsBucket | undefined, range: { startDate: string; endDate: string; startUtc: Date; endExclusiveUtc: Date; useHourly: boolean }): MetricsGranularity => {
    if (!bucket || bucket === 'auto') {
        return range.useHourly ? 'hour' : 'day';
    }

    if (bucket === 'hour') {
        if (!range.useHourly) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Hourly buckets require a single-day range.' });
        }
        return 'hour';
    }

    return bucket;
};

const buildRange = (startDate: string, endDate: string, timezone: string) => {
    const startUtc = fromZonedTime(parseDate(startDate), timezone);
    const endExclusiveUtc = fromZonedTime(addDays(parseDate(endDate), 1), timezone);
    return {
        startDate,
        endDate,
        startUtc,
        endExclusiveUtc,
        useHourly: startDate === endDate,
    };
};

const normalizeDate = (value: string) => {
    const trimmed = value.trim();
    const parts = trimmed.split('-');
    if (parts.length !== 3) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date range format.' });
    }
    return trimmed;
};

const parseDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!(year && month && day)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date in range.' });
    }
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
};

const getDailyMetrics = async (
    accountId: string,
    dimension: MetricsDimension,
    startDate: string,
    endDate: string,
    timezone: string,
    filters: MetricsFilters | undefined,
    granularity: MetricsGranularity
): Promise<{ totals: MetricsTotals; series: MetricsPoint[] }> => {
    const conditions = [eq(performanceDaily.accountId, accountId), gte(performanceDaily.bucketDate, startDate), lte(performanceDaily.bucketDate, endDate)];

    if (filters?.campaignId) {
        conditions.push(eq(performanceDaily.campaignId, filters.campaignId));
    }

    if (filters?.adGroupId) {
        conditions.push(eq(performanceDaily.adGroupId, filters.adGroupId));
    }

    if (dimension === 'campaign' && filters?.ids?.length) {
        conditions.push(inArray(performanceDaily.campaignId, filters.ids));
    }

    if (dimension === 'adGroup' && filters?.ids?.length) {
        conditions.push(inArray(performanceDaily.adGroupId, filters.ids));
    }

    if (dimension === 'ad' && filters?.ids?.length) {
        conditions.push(inArray(performanceDaily.adId, filters.ids));
    }

    if (dimension === 'target') {
        conditions.push(eq(performanceDaily.entityType, 'target'));
        if (filters?.ids?.length) {
            conditions.push(inArray(performanceDaily.entityId, filters.ids));
        }
    }

    const totalsRow = await db
        .select({
            impressions: sql<number>`sum(${performanceDaily.impressions})`.as('impressions'),
            clicks: sql<number>`sum(${performanceDaily.clicks})`.as('clicks'),
            spend: sql<number>`sum(${performanceDaily.spend})`.as('spend'),
            sales: sql<number>`sum(${performanceDaily.sales})`.as('sales'),
            orders: sql<number>`sum(${performanceDaily.orders})`.as('orders'),
        })
        .from(performanceDaily)
        .where(and(...conditions))
        .then(rows => rows[0]);

    const rows = await db
        .select({
            bucketDate: performanceDaily.bucketDate,
            impressions: sql<number>`sum(${performanceDaily.impressions})`.as('impressions'),
            clicks: sql<number>`sum(${performanceDaily.clicks})`.as('clicks'),
            spend: sql<number>`sum(${performanceDaily.spend})`.as('spend'),
            sales: sql<number>`sum(${performanceDaily.sales})`.as('sales'),
            orders: sql<number>`sum(${performanceDaily.orders})`.as('orders'),
        })
        .from(performanceDaily)
        .where(and(...conditions))
        .groupBy(performanceDaily.bucketDate)
        .orderBy(asc(performanceDaily.bucketDate));

    const series = granularity === 'day' ? buildDailySeries(startDate, endDate, timezone, rows) : buildBucketedSeries(startDate, endDate, timezone, granularity, rows);

    return {
        totals: formatTotals(totalsRow),
        series,
    };
};

const getHourlyMetrics = async (
    accountId: string,
    dimension: MetricsDimension,
    startUtc: Date,
    endExclusiveUtc: Date,
    filters?: MetricsFilters
): Promise<{ totals: MetricsTotals; series: MetricsPoint[] }> => {
    const conditions = [eq(performanceHourly.accountId, accountId), gte(performanceHourly.bucketStart, startUtc), lt(performanceHourly.bucketStart, endExclusiveUtc)];

    if (filters?.campaignId) {
        conditions.push(eq(performanceHourly.campaignId, filters.campaignId));
    }

    if (filters?.adGroupId) {
        conditions.push(eq(performanceHourly.adGroupId, filters.adGroupId));
    }

    if (dimension === 'campaign' && filters?.ids?.length) {
        conditions.push(inArray(performanceHourly.campaignId, filters.ids));
    }

    if (dimension === 'adGroup' && filters?.ids?.length) {
        conditions.push(inArray(performanceHourly.adGroupId, filters.ids));
    }

    if (dimension === 'ad' && filters?.ids?.length) {
        conditions.push(inArray(performanceHourly.adId, filters.ids));
    }

    if (dimension === 'target') {
        conditions.push(eq(performanceHourly.entityType, 'target'));
        if (filters?.ids?.length) {
            conditions.push(inArray(performanceHourly.entityId, filters.ids));
        }
    }

    const totalsRow = await db
        .select({
            impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
            clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
            spend: sql<number>`sum(${performanceHourly.spend})`.as('spend'),
            sales: sql<number>`sum(${performanceHourly.sales})`.as('sales'),
            orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
        })
        .from(performanceHourly)
        .where(and(...conditions))
        .then(rows => rows[0]);

    const rows = await db
        .select({
            bucketStart: performanceHourly.bucketStart,
            impressions: sql<number>`sum(${performanceHourly.impressions})`.as('impressions'),
            clicks: sql<number>`sum(${performanceHourly.clicks})`.as('clicks'),
            spend: sql<number>`sum(${performanceHourly.spend})`.as('spend'),
            sales: sql<number>`sum(${performanceHourly.sales})`.as('sales'),
            orders: sql<number>`sum(${performanceHourly.orders})`.as('orders'),
        })
        .from(performanceHourly)
        .where(and(...conditions))
        .groupBy(performanceHourly.bucketStart)
        .orderBy(asc(performanceHourly.bucketStart));

    return {
        totals: formatTotals(totalsRow),
        series: buildHourlySeries(startUtc, endExclusiveUtc, rows),
    };
};

const formatTotals = (row?: { impressions: number | null; clicks: number | null; spend: number | null; sales: number | null; orders: number | null }): MetricsTotals => {
    return buildMetricsValues({
        impressions: Number(row?.impressions ?? 0),
        clicks: Number(row?.clicks ?? 0),
        spend: Number(row?.spend ?? 0),
        sales: Number(row?.sales ?? 0),
        purchases: Number(row?.orders ?? 0),
    });
};

const getDailyMetricsTable = async (accountId: string, dimension: MetricsDimension, startDate: string, endDate: string, options: MetricsTableOptions) => {
    const table = performanceDaily as MetricsTable;
    const conditions = [eq(table.accountId, accountId), gte(table.bucketDate, startDate), lte(table.bucketDate, endDate)];
    applyMetricsFilters(conditions, table, dimension, options);

    const totals = await getMetricsTotals(table, conditions);
    const items = await getMetricsTableItems(table, dimension, conditions, options);

    return {
        totals,
        items,
        sort: options.sort,
    };
};

const getHourlyMetricsTable = async (accountId: string, dimension: MetricsDimension, startUtc: Date, endExclusiveUtc: Date, options: MetricsTableOptions) => {
    const table = performanceHourly as MetricsTable;
    const conditions = [eq(table.accountId, accountId), gte(table.bucketStart, startUtc), lt(table.bucketStart, endExclusiveUtc)];
    applyMetricsFilters(conditions, table, dimension, options);

    const totals = await getMetricsTotals(table, conditions);
    const items = await getMetricsTableItems(table, dimension, conditions, options);

    return {
        totals,
        items,
        sort: options.sort,
    };
};

type MetricsTable = typeof performanceDaily | typeof performanceHourly;

const applyMetricsFilters = (conditions: SQL[], table: MetricsTable, dimension: MetricsDimension, filters: MetricsFilters) => {
    if (filters.campaignId) {
        conditions.push(eq(table.campaignId, filters.campaignId));
    }

    if (filters.adGroupId) {
        conditions.push(eq(table.adGroupId, filters.adGroupId));
    }

    if (dimension === 'campaign' && filters.ids?.length) {
        conditions.push(inArray(table.campaignId, filters.ids));
    }

    if (dimension === 'adGroup' && filters.ids?.length) {
        conditions.push(inArray(table.adGroupId, filters.ids));
    }

    if (dimension === 'ad' && filters.ids?.length) {
        conditions.push(inArray(table.adId, filters.ids));
    }

    if (dimension === 'target') {
        conditions.push(eq(table.entityType, 'target'));
        if (filters.ids?.length) {
            conditions.push(inArray(table.entityId, filters.ids));
        }
    }
};

const getMetricsTotals = async (table: MetricsTable, conditions: SQL[]) => {
    const [row] = await db
        .select({
            impressions: sql<number>`sum(${table.impressions})`.as('impressions'),
            clicks: sql<number>`sum(${table.clicks})`.as('clicks'),
            spend: sql<number>`sum(${table.spend})`.as('spend'),
            sales: sql<number>`sum(${table.sales})`.as('sales'),
            orders: sql<number>`sum(${table.orders})`.as('orders'),
        })
        .from(table)
        .where(and(...conditions));

    return formatTotals(row);
};

const getMetricsTableItems = async (table: MetricsTable, dimension: MetricsDimension, conditions: SQL[], options: MetricsTableOptions) => {
    const metrics = buildMetricExpressions(table);
    const orderExpression = buildSortExpression(options.sort.field, metrics);
    const orderDirection = options.sort.direction === 'asc' ? asc(orderExpression) : desc(orderExpression);

    if (dimension === 'campaign') {
        const rows = await db
            .select({
                campaignId: table.campaignId,
                name: campaign.name,
                state: campaign.state,
                impressions: metrics.impressions.as('impressions'),
                clicks: metrics.clicks.as('clicks'),
                spend: metrics.spend.as('spend'),
                sales: metrics.sales.as('sales'),
                orders: metrics.orders.as('orders'),
            })
            .from(table)
            .leftJoin(campaign, eq(table.campaignId, campaign.campaignId))
            .where(and(...conditions))
            .groupBy(table.campaignId, campaign.name, campaign.state)
            .orderBy(orderDirection, table.campaignId)
            .limit(options.limit)
            .offset(options.offset);

        return rows.map(row => ({
            campaignId: row.campaignId,
            name: row.name ?? null,
            state: row.state ? (String(row.state) as CampaignShape['state']) : null,
            metrics: formatTotals(row),
        }));
    }

    if (dimension === 'adGroup') {
        const rows = await db
            .select({
                adGroupId: table.adGroupId,
                campaignId: table.campaignId,
                campaignName: campaign.name,
                name: adGroup.name,
                state: adGroup.state,
                impressions: metrics.impressions.as('impressions'),
                clicks: metrics.clicks.as('clicks'),
                spend: metrics.spend.as('spend'),
                sales: metrics.sales.as('sales'),
                orders: metrics.orders.as('orders'),
            })
            .from(table)
            .leftJoin(adGroup, eq(table.adGroupId, adGroup.adGroupId))
            .leftJoin(campaign, eq(table.campaignId, campaign.campaignId))
            .where(and(...conditions))
            .groupBy(table.adGroupId, table.campaignId, campaign.name, adGroup.name, adGroup.state)
            .orderBy(orderDirection, table.adGroupId)
            .limit(options.limit)
            .offset(options.offset);

        return rows.map(row => ({
            adGroupId: row.adGroupId,
            campaignId: row.campaignId,
            campaignName: row.campaignName ?? null,
            name: row.name ?? null,
            state: row.state ? (String(row.state) as AdGroupShape['state']) : null,
            metrics: formatTotals(row),
        }));
    }

    if (dimension === 'ad') {
        const rows = await db
            .select({
                adId: table.adId,
                campaignId: table.campaignId,
                campaignName: campaign.name,
                adGroupId: table.adGroupId,
                adGroupName: adGroup.name,
                state: ad.state,
                productId: ad.productAsin,
                impressions: metrics.impressions.as('impressions'),
                clicks: metrics.clicks.as('clicks'),
                spend: metrics.spend.as('spend'),
                sales: metrics.sales.as('sales'),
                orders: metrics.orders.as('orders'),
            })
            .from(table)
            .leftJoin(ad, eq(table.adId, ad.adId))
            .leftJoin(adGroup, eq(table.adGroupId, adGroup.adGroupId))
            .leftJoin(campaign, eq(table.campaignId, campaign.campaignId))
            .where(and(...conditions))
            .groupBy(table.adId, table.campaignId, table.adGroupId, campaign.name, adGroup.name, ad.state, ad.productAsin)
            .orderBy(orderDirection, table.adId)
            .limit(options.limit)
            .offset(options.offset);

        return rows.map(row => ({
            adId: row.adId,
            campaignId: row.campaignId,
            campaignName: row.campaignName ?? null,
            adGroupId: row.adGroupId,
            adGroupName: row.adGroupName ?? null,
            state: row.state ? (String(row.state) as AdShape['state']) : null,
            productId: row.productId ?? null,
            metrics: formatTotals(row),
        }));
    }

    const rows = await db
        .select({
            targetId: table.entityId,
            campaignId: table.campaignId,
            campaignName: campaign.name,
            adGroupId: table.adGroupId,
            adGroupName: adGroup.name,
            state: target.state,
            targetType: target.targetType,
            targetKeyword: target.targetKeyword,
            targetMatchType: target.targetMatchType,
            targetAsin: target.targetAsin,
            impressions: metrics.impressions.as('impressions'),
            clicks: metrics.clicks.as('clicks'),
            spend: metrics.spend.as('spend'),
            sales: metrics.sales.as('sales'),
            orders: metrics.orders.as('orders'),
        })
        .from(table)
        .leftJoin(target, eq(table.entityId, target.targetId))
        .leftJoin(adGroup, eq(table.adGroupId, adGroup.adGroupId))
        .leftJoin(campaign, eq(table.campaignId, campaign.campaignId))
        .where(and(...conditions, eq(table.entityType, 'target')))
        .groupBy(table.entityId, table.campaignId, table.adGroupId, campaign.name, adGroup.name, target.state, target.targetType, target.targetKeyword, target.targetMatchType, target.targetAsin)
        .orderBy(orderDirection, table.entityId)
        .limit(options.limit)
        .offset(options.offset);

    return rows.map(row => {
        const resolvedType = resolveTargetType(row.targetType, row.targetKeyword);
        return {
            targetId: row.targetId,
            campaignId: row.campaignId,
            campaignName: row.campaignName ?? null,
            adGroupId: row.adGroupId ?? null,
            adGroupName: row.adGroupName ?? null,
            state: row.state ? (String(row.state) as TargetShape['state']) : null,
            type: resolvedType,
            keyword: resolvedType === 'KEYWORD' ? (row.targetKeyword ?? null) : null,
            keywordMatchType: resolvedType === 'KEYWORD' ? (row.targetMatchType ? String(row.targetMatchType) : null) : null,
            productId: resolvedType === 'PRODUCT' ? (row.targetAsin ?? null) : null,
            productMatchType: resolvedType === 'PRODUCT' ? (row.targetMatchType ? String(row.targetMatchType) : null) : null,
            metrics: formatTotals(row),
        };
    });
};

const buildMetricExpressions = (table: MetricsTable) => {
    return {
        impressions: sql<number>`sum(${table.impressions})`,
        clicks: sql<number>`sum(${table.clicks})`,
        orders: sql<number>`sum(${table.orders})`,
        spend: sql<number>`sum(${table.spend})`,
        sales: sql<number>`sum(${table.sales})`,
    };
};

const buildSortExpression = (field: MetricsTableSortField, metrics: ReturnType<typeof buildMetricExpressions>) => {
    switch (field) {
        case 'impressions':
            return metrics.impressions;
        case 'clicks':
            return metrics.clicks;
        case 'purchases':
            return metrics.orders;
        case 'sales':
            return metrics.sales;
        case 'ctr':
            return sql<number>`coalesce(${metrics.clicks}::float / nullif(${metrics.impressions}::float, 0), 0)`;
        case 'cpc':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.clicks}::float, 0), 0)`;
        case 'acos':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.sales}::float, 0), 0)`;
        case 'roas':
            return sql<number>`coalesce(${metrics.sales}::float / nullif(${metrics.spend}::float, 0), 0)`;
        default:
            return metrics.spend;
    }
};

const resolveTargetType = (value: string | null, keyword: string | null) => {
    if (value === 'KEYWORD' || value === 'PRODUCT') {
        return value;
    }
    return keyword ? 'KEYWORD' : 'PRODUCT';
};

const formatDailyPoint = (
    row: {
        bucketDate: string | Date;
        impressions: number | null;
        clicks: number | null;
        spend: number | null;
        sales: number | null;
        orders: number | null;
    },
    timezone: string
): MetricsPoint => {
    const dateValue = typeof row.bucketDate === 'string' ? row.bucketDate : format(row.bucketDate, 'yyyy-MM-dd');
    const startUtc = fromZonedTime(parseDate(dateValue), timezone);
    const endUtc = fromZonedTime(addDays(parseDate(dateValue), 1), timezone);

    return {
        start: startUtc.toISOString(),
        end: endUtc.toISOString(),
        metrics: buildMetricsValues({
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            spend: Number(row.spend ?? 0),
            purchases: Number(row.orders ?? 0),
            sales: Number(row.sales ?? 0),
        }),
    };
};

const formatHourlyPoint = (row: { bucketStart: Date; impressions: number | null; clicks: number | null; spend: number | null; sales: number | null; orders: number | null }): MetricsPoint => {
    const start = row.bucketStart.toISOString();
    const end = addHours(row.bucketStart, 1).toISOString();

    return {
        start,
        end,
        metrics: buildMetricsValues({
            impressions: Number(row.impressions ?? 0),
            clicks: Number(row.clicks ?? 0),
            spend: Number(row.spend ?? 0),
            purchases: Number(row.orders ?? 0),
            sales: Number(row.sales ?? 0),
        }),
    };
};

const buildDailySeries = (
    startDate: string,
    endDate: string,
    timezone: string,
    rows: Array<{
        bucketDate: string | Date;
        impressions: number | null;
        clicks: number | null;
        spend: number | null;
        sales: number | null;
        orders: number | null;
    }>
) => {
    const byDate = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        const key = typeof row.bucketDate === 'string' ? row.bucketDate : toIsoDate(row.bucketDate);
        byDate.set(key, { ...row, bucketDate: key });
    }

    const series: MetricsPoint[] = [];
    let cursor = parseDate(startDate);
    const end = parseDate(endDate);

    while (cursor <= end) {
        const key = toIsoDate(cursor);
        const row = byDate.get(key) ?? {
            bucketDate: key,
            impressions: 0,
            clicks: 0,
            spend: 0,
            sales: 0,
            orders: 0,
        };
        series.push(formatDailyPoint(row, timezone));
        cursor = addDays(cursor, 1);
    }

    return series;
};

const buildHourlySeries = (
    startUtc: Date,
    endExclusiveUtc: Date,
    rows: Array<{
        bucketStart: Date;
        impressions: number | null;
        clicks: number | null;
        spend: number | null;
        sales: number | null;
        orders: number | null;
    }>
) => {
    const byStart = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
        byStart.set(row.bucketStart.getTime(), row);
    }

    const series: MetricsPoint[] = [];
    let cursor = new Date(startUtc);
    const end = endExclusiveUtc.getTime();

    while (cursor.getTime() < end) {
        const key = cursor.getTime();
        const row = byStart.get(key) ?? {
            bucketStart: new Date(key),
            impressions: 0,
            clicks: 0,
            spend: 0,
            sales: 0,
            orders: 0,
        };
        series.push(formatHourlyPoint(row));
        cursor = addHours(cursor, 1);
    }

    return series;
};

const addDaysUtc = (value: Date, days: number) => {
    const next = new Date(value.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const addWeeksUtc = (value: Date, weeks: number) => addDaysUtc(value, weeks * 7);

const addMonthsUtc = (value: Date, months: number) => {
    const next = new Date(value.getTime());
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
};

const addYearsUtc = (value: Date, years: number) => {
    const next = new Date(value.getTime());
    next.setUTCFullYear(next.getUTCFullYear() + years);
    return next;
};

const startOfWeekUtc = (value: Date) => {
    const day = value.getUTCDay();
    const diff = (day + 6) % 7;
    return addDaysUtc(value, -diff);
};

const startOfMonthUtc = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const startOfYearUtc = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), 0, 1));

const getBucketStartUtc = (value: Date, granularity: MetricsGranularity) => {
    switch (granularity) {
        case 'week':
            return startOfWeekUtc(value);
        case 'month':
            return startOfMonthUtc(value);
        case 'year':
            return startOfYearUtc(value);
        default:
            return value;
    }
};

const getBucketEndUtc = (value: Date, granularity: MetricsGranularity) => {
    switch (granularity) {
        case 'week':
            return addWeeksUtc(value, 1);
        case 'month':
            return addMonthsUtc(value, 1);
        case 'year':
            return addYearsUtc(value, 1);
        default:
            return addDaysUtc(value, 1);
    }
};

const formatBucketPoint = (
    bucketStart: Date,
    granularity: MetricsGranularity,
    timezone: string,
    row: {
        impressions: number;
        clicks: number;
        spend: number;
        sales: number;
        orders: number;
    }
): MetricsPoint => {
    const startDate = toIsoDate(bucketStart);
    const endDate = toIsoDate(getBucketEndUtc(bucketStart, granularity));
    const startUtc = fromZonedTime(parseDate(startDate), timezone);
    const endUtc = fromZonedTime(parseDate(endDate), timezone);

    return {
        start: startUtc.toISOString(),
        end: endUtc.toISOString(),
        metrics: buildMetricsValues({
            impressions: row.impressions,
            clicks: row.clicks,
            spend: row.spend,
            purchases: row.orders,
            sales: row.sales,
        }),
    };
};

const buildBucketedSeries = (
    startDate: string,
    endDate: string,
    timezone: string,
    granularity: MetricsGranularity,
    rows: Array<{
        bucketDate: string | Date;
        impressions: number | null;
        clicks: number | null;
        spend: number | null;
        sales: number | null;
        orders: number | null;
    }>
) => {
    if (granularity === 'day') {
        return buildDailySeries(startDate, endDate, timezone, rows);
    }

    const byBucket = new Map<string, { impressions: number; clicks: number; spend: number; sales: number; orders: number }>();

    for (const row of rows) {
        const dateValue = typeof row.bucketDate === 'string' ? row.bucketDate : toIsoDate(row.bucketDate);
        const bucketStart = getBucketStartUtc(parseDate(dateValue), granularity);
        const key = toIsoDate(bucketStart);
        const current = byBucket.get(key) ?? { impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 };
        byBucket.set(key, {
            impressions: current.impressions + Number(row.impressions ?? 0),
            clicks: current.clicks + Number(row.clicks ?? 0),
            spend: current.spend + Number(row.spend ?? 0),
            sales: current.sales + Number(row.sales ?? 0),
            orders: current.orders + Number(row.orders ?? 0),
        });
    }

    const series: MetricsPoint[] = [];
    let cursor = getBucketStartUtc(parseDate(startDate), granularity);
    const end = parseDate(endDate);

    while (cursor <= end) {
        const key = toIsoDate(cursor);
        const row = byBucket.get(key) ?? {
            impressions: 0,
            clicks: 0,
            spend: 0,
            sales: 0,
            orders: 0,
        };
        series.push(formatBucketPoint(cursor, granularity, timezone, row));
        cursor = getBucketEndUtc(cursor, granularity);
    }

    return series;
};

const buildMetricsValues = (value: { impressions: number; clicks: number; spend: number; purchases: number; sales: number }): MetricsTotals => {
    const { impressions, clicks, spend, purchases, sales } = value;
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

const buildEmptyMetrics = () =>
    buildMetricsValues({
        impressions: 0,
        clicks: 0,
        spend: 0,
        purchases: 0,
        sales: 0,
    });

const selectMetrics = (metrics: MetricsTotals, selection?: MetricsSelection) => {
    if (!selection || selection.length === 0) {
        return metrics;
    }

    const picked: Partial<MetricsTotals> = {};
    for (const key of selection) {
        picked[key] = metrics[key] ?? null;
    }
    return picked as MetricsTotals;
};

const buildEmptySeries = (
    range: { startDate: string; endDate: string; startUtc: Date; endExclusiveUtc: Date; useHourly: boolean },
    timezone: string,
    selection: MetricsSelection | undefined,
    granularity: MetricsGranularity
) => {
    const series =
        granularity === 'hour'
            ? buildHourlySeries(range.startUtc, range.endExclusiveUtc, [])
            : granularity === 'day'
              ? buildDailySeries(range.startDate, range.endDate, timezone, [])
              : buildBucketedSeries(range.startDate, range.endDate, timezone, granularity, []);
    return series.map(point => ({
        ...point,
        metrics: selectMetrics(point.metrics, selection),
    }));
};

const mergeIds = (primary?: string[], secondary?: string[]) => {
    if (primary && secondary) {
        const secondarySet = new Set(secondary);
        return primary.filter(id => secondarySet.has(id));
    }
    return primary ?? secondary;
};

const resolveFilteredIds = async (
    config: CliConfig,
    dimension: MetricsDimension,
    range: { startDate: string; endDate: string; startUtc: Date; endExclusiveUtc: Date; useHourly: boolean },
    options: MetricsSeriesOptions
) => {
    const filters = options.filters;
    if (!filters) {
        return undefined;
    }

    const entityIds = hasEntityFilters(filters) ? await resolveEntityFilterIds(config, dimension, options.scope, filters) : undefined;
    const metricIds = hasMetricFilters(filters) ? await resolveMetricFilterIds(config.accountId, dimension, range, options.scope, filters) : undefined;

    return mergeIds(entityIds, metricIds);
};

const hasEntityFilters = (filters: MetricsFilterInput) => {
    return Boolean(
        filters.search || (filters.state && filters.state !== 'ALL') || filters.targeting || filters.targetType || filters.targetMatchType || filters.budget || filters.endDate || filters.outOfBudget
    );
};

const hasMetricFilters = (filters: MetricsFilterInput) => {
    if (!filters.metrics) {
        return false;
    }
    return Object.values(filters.metrics).some(value => value?.min !== undefined || value?.max !== undefined);
};

const resolveEntityFilterIds = async (config: CliConfig, dimension: MetricsDimension, scope: MetricsFilters, filters: MetricsFilterInput) => {
    const countryCode = normalizeCountryCode(config.countryCode);
    const search = filters.search?.trim();
    const stateFilter = filters.state ? (filters.state === 'ALL' ? null : filters.state) : null;
    const targeting = filters.targeting;
    const targetType = filters.targetType;
    const targetMatchType = filters.targetMatchType;
    const budget = filters.budget;
    const endDate = filters.endDate;
    const outOfBudget = filters.outOfBudget;

    if (dimension === 'campaign') {
        const conditions: SQL[] = [eq(campaign.accountId, config.accountId)];

        if (countryCode) {
            conditions.push(eq(campaign.countryCode, countryCode));
        }
        if (scope.campaignId) {
            conditions.push(eq(campaign.campaignId, scope.campaignId));
        }
        if (stateFilter) {
            conditions.push(eq(campaign.state, stateFilter));
        }
        if (targeting) {
            conditions.push(eq(campaign.targetingSettings, targeting));
        }
        if (budget?.min !== undefined) {
            conditions.push(gte(campaign.budgetAmount, String(budget.min)));
        }
        if (budget?.max !== undefined) {
            conditions.push(lte(campaign.budgetAmount, String(budget.max)));
        }
        if (endDate?.after) {
            conditions.push(gte(campaign.endDate, endDate.after));
        }
        if (endDate?.before) {
            conditions.push(lte(campaign.endDate, endDate.before));
        }
        if (outOfBudget !== undefined) {
            if (outOfBudget) {
                conditions.push(eq(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            } else {
                conditions.push(ne(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            }
        }
        if (search) {
            const pattern = `%${search}%`;
            const searchCondition = or(ilike(campaign.name, pattern), ilike(campaign.campaignId, pattern));
            if (searchCondition) {
                conditions.push(searchCondition);
            }
        }

        const rows = await db
            .select({ id: campaign.campaignId })
            .from(campaign)
            .where(and(...conditions));
        return rows.map(row => row.id);
    }

    if (dimension === 'adGroup') {
        const conditions: SQL[] = [eq(campaign.accountId, config.accountId)];
        if (countryCode) {
            conditions.push(eq(campaign.countryCode, countryCode));
        }
        if (scope.campaignId) {
            conditions.push(eq(adGroup.campaignId, scope.campaignId));
        }
        if (scope.adGroupId) {
            conditions.push(eq(adGroup.adGroupId, scope.adGroupId));
        }
        if (stateFilter) {
            conditions.push(eq(adGroup.state, stateFilter));
        }
        if (targeting) {
            conditions.push(eq(campaign.targetingSettings, targeting));
        }
        if (budget?.min !== undefined) {
            conditions.push(gte(campaign.budgetAmount, String(budget.min)));
        }
        if (budget?.max !== undefined) {
            conditions.push(lte(campaign.budgetAmount, String(budget.max)));
        }
        if (endDate?.after) {
            conditions.push(gte(campaign.endDate, endDate.after));
        }
        if (endDate?.before) {
            conditions.push(lte(campaign.endDate, endDate.before));
        }
        if (outOfBudget !== undefined) {
            if (outOfBudget) {
                conditions.push(eq(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            } else {
                conditions.push(ne(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            }
        }
        if (search) {
            const pattern = `%${search}%`;
            const searchCondition = or(ilike(adGroup.name, pattern), ilike(adGroup.adGroupId, pattern), ilike(campaign.name, pattern));
            if (searchCondition) {
                conditions.push(searchCondition);
            }
        }

        const rows = await db
            .select({ id: adGroup.adGroupId })
            .from(adGroup)
            .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
            .where(and(...conditions));
        return rows.map(row => row.id);
    }

    if (dimension === 'ad') {
        const conditions: SQL[] = [eq(campaign.accountId, config.accountId)];
        if (countryCode) {
            conditions.push(eq(campaign.countryCode, countryCode));
        }
        if (scope.campaignId) {
            conditions.push(eq(ad.campaignId, scope.campaignId));
        }
        if (scope.adGroupId) {
            conditions.push(eq(ad.adGroupId, scope.adGroupId));
        }
        if (stateFilter) {
            conditions.push(eq(ad.state, stateFilter));
        }
        if (targeting) {
            conditions.push(eq(campaign.targetingSettings, targeting));
        }
        if (budget?.min !== undefined) {
            conditions.push(gte(campaign.budgetAmount, String(budget.min)));
        }
        if (budget?.max !== undefined) {
            conditions.push(lte(campaign.budgetAmount, String(budget.max)));
        }
        if (endDate?.after) {
            conditions.push(gte(campaign.endDate, endDate.after));
        }
        if (endDate?.before) {
            conditions.push(lte(campaign.endDate, endDate.before));
        }
        if (outOfBudget !== undefined) {
            if (outOfBudget) {
                conditions.push(eq(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            } else {
                conditions.push(ne(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
            }
        }
        if (search) {
            const pattern = `%${search}%`;
            const searchCondition = or(ilike(ad.adId, pattern), ilike(ad.productAsin, pattern), ilike(campaign.name, pattern), ilike(adGroup.name, pattern));
            if (searchCondition) {
                conditions.push(searchCondition);
            }
        }

        const rows = await db
            .select({ id: ad.adId })
            .from(ad)
            .innerJoin(campaign, eq(ad.campaignId, campaign.campaignId))
            .innerJoin(adGroup, eq(ad.adGroupId, adGroup.adGroupId))
            .where(and(...conditions));
        return rows.map(row => row.id);
    }

    const conditions: SQL[] = [eq(campaign.accountId, config.accountId)];
    if (countryCode) {
        conditions.push(eq(campaign.countryCode, countryCode));
    }
    if (scope.campaignId) {
        conditions.push(eq(target.campaignId, scope.campaignId));
    }
    if (scope.adGroupId) {
        conditions.push(eq(target.adGroupId, scope.adGroupId));
    }
    if (stateFilter) {
        conditions.push(eq(target.state, stateFilter));
    }
    if (targetType) {
        conditions.push(eq(target.targetType, targetType));
    }
    if (targetMatchType) {
        conditions.push(eq(target.targetMatchType, targetMatchType));
    }
    if (targeting) {
        conditions.push(eq(campaign.targetingSettings, targeting));
    }
    if (budget?.min !== undefined) {
        conditions.push(gte(campaign.budgetAmount, String(budget.min)));
    }
    if (budget?.max !== undefined) {
        conditions.push(lte(campaign.budgetAmount, String(budget.max)));
    }
    if (endDate?.after) {
        conditions.push(gte(campaign.endDate, endDate.after));
    }
    if (endDate?.before) {
        conditions.push(lte(campaign.endDate, endDate.before));
    }
    if (outOfBudget !== undefined) {
        if (outOfBudget) {
            conditions.push(eq(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
        } else {
            conditions.push(ne(campaign.deliveryStatus, 'OUT_OF_BUDGET'));
        }
    }
    if (search) {
        const pattern = `%${search}%`;
        const searchCondition = or(
            ilike(target.targetId, pattern),
            ilike(target.targetKeyword, pattern),
            ilike(target.targetAsin, pattern),
            ilike(campaign.name, pattern),
            ilike(adGroup.name, pattern)
        );
        if (searchCondition) {
            conditions.push(searchCondition);
        }
    }

    const rows = await db
        .select({ id: target.targetId })
        .from(target)
        .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
        .leftJoin(adGroup, eq(target.adGroupId, adGroup.adGroupId))
        .where(and(...conditions));
    return rows.map(row => row.id);
};

const resolveMetricFilterIds = async (
    accountId: string,
    dimension: MetricsDimension,
    range: { startDate: string; endDate: string; startUtc: Date; endExclusiveUtc: Date; useHourly: boolean },
    scope: MetricsFilters,
    filters: MetricsFilterInput
) => {
    const metricFilters = filters.metrics;
    if (!metricFilters) {
        return undefined;
    }

    const table = range.useHourly ? (performanceHourly as MetricsTable) : (performanceDaily as MetricsTable);
    const conditions: SQL[] = [eq(table.accountId, accountId)];

    if (range.useHourly) {
        conditions.push(gte(table.bucketStart, range.startUtc), lt(table.bucketStart, range.endExclusiveUtc));
    } else {
        conditions.push(gte(table.bucketDate, range.startDate), lte(table.bucketDate, range.endDate));
    }

    if (scope.campaignId) {
        conditions.push(eq(table.campaignId, scope.campaignId));
    }
    if (scope.adGroupId) {
        conditions.push(eq(table.adGroupId, scope.adGroupId));
    }
    if (scope.ids?.length) {
        const column = resolveDimensionColumn(table, dimension);
        conditions.push(inArray(column, scope.ids));
    }
    if (dimension === 'target') {
        conditions.push(eq(table.entityType, 'target'));
    }

    const metrics = buildMetricExpressions(table);
    const having: SQL[] = [];

    for (const [key, rangeFilter] of Object.entries(metricFilters)) {
        if (!rangeFilter) {
            continue;
        }
        const expr = buildMetricValueExpression(key as MetricsKey, metrics);
        if (rangeFilter.min !== undefined) {
            having.push(gte(expr, rangeFilter.min));
        }
        if (rangeFilter.max !== undefined) {
            having.push(lte(expr, rangeFilter.max));
        }
    }

    if (having.length === 0) {
        return undefined;
    }

    const idColumn = resolveDimensionColumn(table, dimension);
    const rows = await db
        .select({ id: idColumn })
        .from(table)
        .where(and(...conditions))
        .groupBy(idColumn)
        .having(and(...having));

    return rows.map(row => row.id);
};

const resolveDimensionColumn = (table: MetricsTable, dimension: MetricsDimension) => {
    switch (dimension) {
        case 'campaign':
            return table.campaignId;
        case 'adGroup':
            return table.adGroupId;
        case 'ad':
            return table.adId;
        case 'target':
            return table.entityId;
        default:
            throw new Error(`Unsupported dimension: ${dimension}`);
    }
};

const buildMetricValueExpression = (key: MetricsKey, metrics: ReturnType<typeof buildMetricExpressions>) => {
    switch (key) {
        case 'impressions':
            return metrics.impressions;
        case 'clicks':
            return metrics.clicks;
        case 'purchases':
            return metrics.orders;
        case 'sales':
            return metrics.sales;
        case 'ctr':
            return sql<number>`coalesce(${metrics.clicks}::float / nullif(${metrics.impressions}::float, 0), 0)`;
        case 'cpc':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.clicks}::float, 0), 0)`;
        case 'acos':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.sales}::float, 0), 0)`;
        case 'roas':
            return sql<number>`coalesce(${metrics.sales}::float / nullif(${metrics.spend}::float, 0), 0)`;
        default:
            return metrics.spend;
    }
};

const extractBudgetValue = (budget: Record<string, unknown> | null) => {
    if (!budget) {
        return null;
    }
    const budgetValue = budget.budgetValue as Record<string, unknown> | undefined;
    const monetaryValue = budgetValue?.monetaryBudgetValue as Record<string, unknown> | undefined;
    const monetaryBudget = monetaryValue?.monetaryBudget as Record<string, unknown> | undefined;
    const value = monetaryBudget?.value;
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

const toIsoDate = (value: Date | string) => {
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }
    return value;
};

const normalizeCountryCode = (value?: string) => {
    if (!value) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed.toUpperCase() : null;
};

const resolveAdvertiserAccount = async (config: CliConfig) => {
    const countryCode = normalizeCountryCode(config.countryCode);
    if (countryCode) {
        return db.query.advertiserAccount.findFirst({
            where: and(eq(advertiserAccount.adsAccountId, config.accountId), eq(advertiserAccount.countryCode, countryCode)),
        });
    }

    const accounts = await db.query.advertiserAccount.findMany({
        where: eq(advertiserAccount.adsAccountId, config.accountId),
    });

    if (accounts.length === 0) {
        return null;
    }

    const countryCodes = Array.from(new Set(accounts.map(account => account.countryCode.toUpperCase()))).sort();
    if (countryCodes.length > 1) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Multiple country codes found for this account. Set config country to one of: ${countryCodes.join(', ')}.`,
        });
    }

    return accounts[0];
};
