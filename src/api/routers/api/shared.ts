import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { addDays, addHours, format, startOfDay } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { z } from 'zod';
import { db } from '@/db/index';
import { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, target } from '@/db/schema';
import { getTimezoneForCountry } from '@/utils/timezones';
import { parseNumeric, toMoneyString } from '@/api/routers/ads/shared';
import type { Context } from '@/api/context';
import type { ApiRegion } from '@/amazon-ads/config';
import {
    bidStrategySchema,
    campaignSchema,
    adGroupSchema,
    adSchema,
    targetSchema,
    listStateSchema,
    metricsTotalsSchema,
    metricsPointSchema,
} from '@/api/schemas/cli';

export type CliConfig = {
    accountId: string;
    countryCode?: string;
    range: string;
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
type MetricsFilters = {
    campaignId?: string;
    adGroupId?: string;
};

export const assertAccountAccess = (ctx: Context, config: CliConfig) => {
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
        .where(
            and(
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : []),
                ...(stateFilter ? [eq(campaign.state, stateFilter)] : [])
            )
        )
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
        .where(
            and(
                eq(campaign.accountId, config.accountId),
                eq(campaign.campaignId, campaignId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])
            )
        )
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
        .where(
            and(
                eq(adGroup.adGroupId, adGroupId),
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])
            )
        )
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
        .where(
            and(
                eq(ad.adId, adId),
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])
            )
        )
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
        .where(
            and(
                eq(target.targetId, targetId),
                eq(campaign.accountId, config.accountId),
                ...(countryCode ? [eq(campaign.countryCode, countryCode)] : [])
            )
        )
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
    if (updates.state) values.state = updates.state;
    if (updates.name) values.name = updates.name;
    if (updates.bidStrategy !== undefined) values.bidStrategy = updates.bidStrategy;
    if (updates.budget !== undefined) values.budgetAmount = toMoneyString(updates.budget);
    if (updates.startDateTime) values.startDate = updates.startDateTime.slice(0, 10);
    if (updates.endDateTime !== undefined) values.endDate = updates.endDateTime ? updates.endDateTime.slice(0, 10) : null;
    if (Object.keys(values).length === 0) return;
    values.lastUpdatedDateTime = new Date();
    await db.update(campaign).set(values).where(eq(campaign.campaignId, campaignId));
};

export const updateAdGroupRow = async (adGroupId: string, updates: Partial<{ state: string; name: string; defaultBid: number }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) values.state = updates.state;
    if (updates.name) values.name = updates.name;
    if (updates.defaultBid !== undefined) values.bidAmount = toMoneyString(updates.defaultBid);
    if (Object.keys(values).length === 0) return;
    values.lastUpdatedDateTime = new Date();
    await db.update(adGroup).set(values).where(eq(adGroup.adGroupId, adGroupId));
};

export const updateAdRow = async (adId: string, updates: Partial<{ state: string }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) values.state = updates.state;
    if (Object.keys(values).length === 0) return;
    values.lastUpdatedDateTime = new Date();
    await db.update(ad).set(values).where(eq(ad.adId, adId));
};

export const updateTargetRow = async (targetId: string, updates: Partial<{ state: string; bid: number }>) => {
    const values: Record<string, unknown> = {};
    if (updates.state) values.state = updates.state;
    if (updates.bid !== undefined) values.bidAmount = toMoneyString(updates.bid);
    if (Object.keys(values).length === 0) return;
    values.lastUpdatedDateTime = new Date();
    await db.update(target).set(values).where(eq(target.targetId, targetId));
};

export const getMetrics = async (
    config: CliConfig,
    entityType: 'campaign' | 'adGroup' | 'ad' | 'target',
    entityId?: string,
    filters?: MetricsFilters
) => {
    const account = await resolveAdvertiserAccount(config);

    if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found.' });
    }

    const timezone = getTimezoneForCountry(account.countryCode);
    const range = parseConfigRange(config.range, timezone);

    if (range.useHourly) {
        return getHourlyMetrics(config.accountId, entityType, entityId, range.startUtc, range.endExclusiveUtc, filters);
    }

    return getDailyMetrics(config.accountId, entityType, entityId, range.startDate, range.endDate, timezone, filters);
};

export const resolveProductIdType = (value: string | null) => {
    if (!value) return 'ASIN' as const;
    return 'ASIN' as const;
};

export const mapCampaignFromApi = (campaignData: Record<string, unknown>): CampaignShape => {
    const budgets = (campaignData.budgets as Array<Record<string, unknown>> | undefined) ?? [];
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

const mapAdGroupRow = (row: {
    adGroupId: string | null;
    campaignId: string | null;
    name: string | null;
    state: string | null;
    bidAmount: string | number | null;
}): AdGroupShape => ({
    adGroupId: String(row.adGroupId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    name: String(row.name ?? ''),
    state: String(row.state ?? 'PAUSED') as AdGroupShape['state'],
    defaultBid: parseNumeric(row.bidAmount) ?? 0,
});

const mapAdRow = (row: {
    adId: string | null;
    campaignId: string | null;
    adGroupId: string | null;
    state: string | null;
    productId: string | null;
}): AdShape => ({
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
    const euCountries = new Set([
        'GB',
        'IE',
        'DE',
        'FR',
        'ES',
        'IT',
        'NL',
        'BE',
        'SE',
        'PL',
        'TR',
        'AE',
        'SA',
        'EG',
    ]);
    const feCountries = new Set(['JP', 'AU', 'IN', 'SG']);

    if (naCountries.has(code)) return 'na';
    if (euCountries.has(code)) return 'eu';
    if (feCountries.has(code)) return 'fe';
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

    const match = range.trim().match(/^(\d+)d$/);
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
    if (!year || !month || !day) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid date in range.' });
    }
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
};

const getDailyMetrics = async (
    accountId: string,
    entityType: 'campaign' | 'adGroup' | 'ad' | 'target',
    entityId: string | undefined,
    startDate: string,
    endDate: string,
    timezone: string,
    filters?: MetricsFilters
): Promise<{ totals: MetricsTotals; series: MetricsPoint[] }> => {
    const conditions = [
        eq(performanceDaily.accountId, accountId),
        gte(performanceDaily.bucketDate, startDate),
        lte(performanceDaily.bucketDate, endDate),
    ];

    if (filters?.campaignId) {
        conditions.push(eq(performanceDaily.campaignId, filters.campaignId));
    }

    if (filters?.adGroupId) {
        conditions.push(eq(performanceDaily.adGroupId, filters.adGroupId));
    }

    if (entityType === 'campaign' && entityId) {
        conditions.push(eq(performanceDaily.campaignId, entityId));
    }

    if (entityType === 'adGroup' && entityId) {
        conditions.push(eq(performanceDaily.adGroupId, entityId));
    }

    if (entityType === 'ad' && entityId) {
        conditions.push(eq(performanceDaily.adId, entityId));
    }

    if (entityType === 'target') {
        conditions.push(eq(performanceDaily.entityType, 'target'));
        if (entityId) {
            conditions.push(eq(performanceDaily.entityId, entityId));
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

    return {
        totals: formatTotals(totalsRow),
        series: rows.map(row => formatDailyPoint(row, timezone)),
    };
};

const getHourlyMetrics = async (
    accountId: string,
    entityType: 'campaign' | 'adGroup' | 'ad' | 'target',
    entityId: string | undefined,
    startUtc: Date,
    endExclusiveUtc: Date,
    filters?: MetricsFilters
): Promise<{ totals: MetricsTotals; series: MetricsPoint[] }> => {
    const conditions = [
        eq(performanceHourly.accountId, accountId),
        gte(performanceHourly.bucketStart, startUtc),
        lt(performanceHourly.bucketStart, endExclusiveUtc),
    ];

    if (filters?.campaignId) {
        conditions.push(eq(performanceHourly.campaignId, filters.campaignId));
    }

    if (filters?.adGroupId) {
        conditions.push(eq(performanceHourly.adGroupId, filters.adGroupId));
    }

    if (entityType === 'campaign' && entityId) {
        conditions.push(eq(performanceHourly.campaignId, entityId));
    }

    if (entityType === 'adGroup' && entityId) {
        conditions.push(eq(performanceHourly.adGroupId, entityId));
    }

    if (entityType === 'ad' && entityId) {
        conditions.push(eq(performanceHourly.adId, entityId));
    }

    if (entityType === 'target') {
        conditions.push(eq(performanceHourly.entityType, 'target'));
        if (entityId) {
            conditions.push(eq(performanceHourly.entityId, entityId));
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
        series: rows.map(formatHourlyPoint),
    };
};

const formatTotals = (row?: {
    impressions: number | null;
    clicks: number | null;
    spend: number | null;
    sales: number | null;
    orders: number | null;
}): MetricsTotals => {
    const impressions = Number(row?.impressions ?? 0);
    const clicks = Number(row?.clicks ?? 0);
    const spend = Number(row?.spend ?? 0);
    const sales = Number(row?.sales ?? 0);
    const purchases = Number(row?.orders ?? 0);

    return {
        impressions,
        clicks,
        spend,
        purchases,
        sales,
        acos: sales > 0 ? spend / sales : null,
        cpc: clicks > 0 ? spend / clicks : null,
        ctr: impressions > 0 ? clicks / impressions : null,
    };
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
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        spend: Number(row.spend ?? 0),
        purchases: Number(row.orders ?? 0),
        sales: Number(row.sales ?? 0),
    };
};

const formatHourlyPoint = (row: {
    bucketStart: Date;
    impressions: number | null;
    clicks: number | null;
    spend: number | null;
    sales: number | null;
    orders: number | null;
}): MetricsPoint => {
    const start = row.bucketStart.toISOString();
    const end = addHours(row.bucketStart, 1).toISOString();

    return {
        start,
        end,
        impressions: Number(row.impressions ?? 0),
        clicks: Number(row.clicks ?? 0),
        spend: Number(row.spend ?? 0),
        purchases: Number(row.orders ?? 0),
        sales: Number(row.sales ?? 0),
    };
};

const extractBudgetValue = (budget: Record<string, unknown> | null) => {
    if (!budget) return null;
    const budgetValue = budget.budgetValue as Record<string, unknown> | undefined;
    const monetaryValue = budgetValue?.monetaryBudgetValue as Record<string, unknown> | undefined;
    const monetaryBudget = monetaryValue?.monetaryBudget as Record<string, unknown> | undefined;
    const value = monetaryBudget?.value;
    if (typeof value === 'number') return value;
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
    if (!value) return null;
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
