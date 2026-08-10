import { addDays } from 'date-fns';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { adGroup, campaign, performanceDaily, target } from '@/db/schema';
import type { OperationContext } from './operation-context';
import { buildSearchMetricValues, emptySearchMetrics, type SearchMetricTotals } from './search-metrics';
import type { SearchFilter, SearchPlan } from './search-planner';
import type { SearchRow } from './search-query';

type TargetSearchSettings = {
    targetId: string;
    targetAdGroupId: string | null;
    targetState: string;
    targetDeliveryStatus: string;
    targetNegative: boolean;
    targetBid: string | null;
    targetMatchType: string | null;
    targetAsin: string | null;
    targetKeyword: string | null;
    targetType: string;
    adGroupId: string | null;
    adGroupName: string | null;
    adGroupState: string | null;
    adGroupDeliveryStatus: string | null;
    adGroupDefaultBid: string | null;
    campaignId: string;
    campaignName: string;
    campaignState: string;
    campaignDeliveryStatus: string;
    campaignDailyBudget: string | null;
    campaignTargetingSettings: string;
    campaignBidStrategy: string | null;
    campaignStartDate: string;
    campaignEndDate: string | null;
};

type TargetSearchDatabaseRow = TargetSearchSettings & {
    bucketDate: string | null;
    impressions: number | string | null;
    clicks: number | string | null;
    spend: number | string | null;
    orders: number | string | null;
    sales: number | string | null;
};

export const queryTargetSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    const rows = plan.performance ? await queryTargetPerformanceRows(context, account, plan) : await queryTargetSettingsRows(context, account);
    if (!plan.segmented) {
        return rows.map(row => buildTargetSearchRow(row, plan.performance ? toTargetMetricTotals(row) : emptySearchMetrics(), null));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    const rowsByTargetAndDate = new Map(rows.filter(row => row.bucketDate !== null).map(row => [`${row.targetId}\u0000${row.bucketDate}`, row]));
    const rowsByTarget = new Map<string, TargetSearchDatabaseRow>();
    for (const row of rows) {
        if (!rowsByTarget.has(row.targetId)) {
            rowsByTarget.set(row.targetId, row);
        }
    }

    return [...rowsByTarget.values()].flatMap(row =>
        dates.map(date => {
            const segmentedRow = rowsByTargetAndDate.get(`${row.targetId}\u0000${date}`);
            return buildTargetSearchRow(segmentedRow ?? row, segmentedRow ? toTargetMetricTotals(segmentedRow) : emptySearchMetrics(), date);
        })
    );
};

const queryTargetSettingsRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }): Promise<TargetSearchDatabaseRow[]> => {
    const rows = await context.db
        .select({
            targetId: target.targetId,
            targetAdGroupId: target.adGroupId,
            targetState: target.state,
            targetDeliveryStatus: target.deliveryStatus,
            targetNegative: target.negative,
            targetBid: target.bidAmount,
            targetMatchType: target.targetMatchType,
            targetAsin: target.targetAsin,
            targetKeyword: target.targetKeyword,
            targetType: target.targetType,
            adGroupId: adGroup.adGroupId,
            adGroupName: adGroup.name,
            adGroupState: adGroup.state,
            adGroupDeliveryStatus: adGroup.deliveryStatus,
            adGroupDefaultBid: adGroup.bidAmount,
            campaignId: campaign.campaignId,
            campaignName: campaign.name,
            campaignState: campaign.state,
            campaignDeliveryStatus: campaign.deliveryStatus,
            campaignDailyBudget: campaign.budgetAmount,
            campaignTargetingSettings: campaign.targetingSettings,
            campaignBidStrategy: campaign.bidStrategy,
            campaignStartDate: campaign.startDate,
            campaignEndDate: campaign.endDate,
            bucketDate: sql<string | null>`NULL`.as('bucket_date'),
            impressions: sql<number>`0`.as('impressions'),
            clicks: sql<number>`0`.as('clicks'),
            spend: sql<number>`0`.as('spend'),
            orders: sql<number>`0`.as('orders'),
            sales: sql<number>`0`.as('sales'),
        })
        .from(target)
        .leftJoin(adGroup, and(eq(adGroup.adGroupId, target.adGroupId), eq(adGroup.campaignId, target.campaignId), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, target.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .where(eq(target.adProduct, 'SPONSORED_PRODUCTS'))
        .orderBy(asc(target.targetId));
    return rows;
};

const queryTargetPerformanceRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<TargetSearchDatabaseRow[]> => {
    const metrics = {
        impressions: sql<number>`coalesce(sum(${performanceDaily.impressions}), 0)`.as('impressions'),
        clicks: sql<number>`coalesce(sum(${performanceDaily.clicks}), 0)`.as('clicks'),
        spend: sql<number>`coalesce(sum(${performanceDaily.spend}), 0)`.as('spend'),
        orders: sql<number>`coalesce(sum(${performanceDaily.purchases}), 0)`.as('orders'),
        sales: sql<number>`coalesce(sum(${performanceDaily.sales}), 0)`.as('sales'),
    };
    const archiveJoin = and(
        eq(performanceDaily.accountId, account.adsAccountId),
        eq(performanceDaily.campaignId, target.campaignId),
        eq(performanceDaily.entityType, 'target'),
        eq(performanceDaily.entityId, target.targetId),
        gte(performanceDaily.bucketDate, plan.dateRange?.startDate ?? ''),
        lte(performanceDaily.bucketDate, plan.dateRange?.endDate ?? ''),
        ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildTargetDateCondition)
    );
    const rows = await context.db
        .select({
            targetId: target.targetId,
            targetAdGroupId: target.adGroupId,
            targetState: target.state,
            targetDeliveryStatus: target.deliveryStatus,
            targetNegative: target.negative,
            targetBid: target.bidAmount,
            targetMatchType: target.targetMatchType,
            targetAsin: target.targetAsin,
            targetKeyword: target.targetKeyword,
            targetType: target.targetType,
            adGroupId: adGroup.adGroupId,
            adGroupName: adGroup.name,
            adGroupState: adGroup.state,
            adGroupDeliveryStatus: adGroup.deliveryStatus,
            adGroupDefaultBid: adGroup.bidAmount,
            campaignId: campaign.campaignId,
            campaignName: campaign.name,
            campaignState: campaign.state,
            campaignDeliveryStatus: campaign.deliveryStatus,
            campaignDailyBudget: campaign.budgetAmount,
            campaignTargetingSettings: campaign.targetingSettings,
            campaignBidStrategy: campaign.bidStrategy,
            campaignStartDate: campaign.startDate,
            campaignEndDate: campaign.endDate,
            bucketDate: plan.segmented ? performanceDaily.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(target)
        .leftJoin(adGroup, and(eq(adGroup.adGroupId, target.adGroupId), eq(adGroup.campaignId, target.campaignId), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, target.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .leftJoin(performanceDaily, archiveJoin)
        .where(eq(target.adProduct, 'SPONSORED_PRODUCTS'))
        .groupBy(
            target.targetId,
            target.adGroupId,
            target.state,
            target.deliveryStatus,
            target.negative,
            target.bidAmount,
            target.targetMatchType,
            target.targetAsin,
            target.targetKeyword,
            target.targetType,
            adGroup.adGroupId,
            adGroup.name,
            adGroup.state,
            adGroup.deliveryStatus,
            adGroup.bidAmount,
            campaign.campaignId,
            campaign.name,
            campaign.state,
            campaign.deliveryStatus,
            campaign.budgetAmount,
            campaign.targetingSettings,
            campaign.bidStrategy,
            campaign.startDate,
            campaign.endDate,
            ...(plan.segmented ? [performanceDaily.bucketDate] : [])
        )
        .orderBy(asc(target.targetId), ...(plan.segmented ? [asc(performanceDaily.bucketDate)] : []));
    return rows;
};

const buildTargetSearchRow = (row: TargetSearchDatabaseRow, totals: SearchMetricTotals, date: string | null): SearchRow => {
    const type = normalizeTargetType(row.targetType, row.targetKeyword, row.targetAsin);
    const metrics = buildSearchMetricValues(totals);
    return {
        values: {
            'target.id': row.targetId,
            'target.state': row.targetState,
            'target.deliveryStatus': row.targetDeliveryStatus,
            'target.type': type,
            'target.scope': row.targetAdGroupId === null ? 'CAMPAIGN' : 'AD_GROUP',
            'target.bid': row.targetNegative || row.targetBid === null ? null : toNumber(row.targetBid),
            'target.negative': row.targetNegative,
            'target.keyword': type === 'KEYWORD' ? row.targetKeyword : null,
            'target.asin': type === 'PRODUCT' ? row.targetAsin : null,
            'target.matchType': row.targetMatchType,
            'adGroup.id': row.adGroupId,
            'adGroup.name': row.adGroupName,
            'adGroup.state': row.adGroupState,
            'adGroup.deliveryStatus': row.adGroupDeliveryStatus,
            'adGroup.defaultBid': row.adGroupDefaultBid === null ? null : toNumber(row.adGroupDefaultBid),
            'campaign.id': row.campaignId,
            'campaign.name': row.campaignName,
            'campaign.state': row.campaignState,
            'campaign.deliveryStatus': row.campaignDeliveryStatus,
            'campaign.dailyBudget': row.campaignDailyBudget === null ? null : toNumber(row.campaignDailyBudget),
            'campaign.targetingMode': normalizeTargetingMode(row.campaignTargetingSettings, type),
            'campaign.bidStrategy': normalizeBidStrategy(row.campaignBidStrategy),
            'campaign.startDate': toDateString(row.campaignStartDate),
            'campaign.endDate': row.campaignEndDate ? toDateString(row.campaignEndDate) : null,
            'metrics.impressions': metrics.impressions,
            'metrics.clicks': metrics.clicks,
            'metrics.spend': metrics.spend,
            'metrics.orders': metrics.orders,
            'metrics.sales': metrics.sales,
            'metrics.acos': metrics.acos,
            'metrics.cpc': metrics.cpc,
            'metrics.ctr': metrics.ctr,
            'metrics.roas': metrics.roas,
            'metrics.cvr': metrics.cvr,
            'segments.date': date,
        },
        metricTotals: totals,
    };
};

const buildTargetDateCondition = (filter: SearchFilter) => {
    switch (filter.operator) {
        case 'eq':
            return eq(performanceDaily.bucketDate, filter.value as string);
        case 'in':
            return inArray(performanceDaily.bucketDate, filter.value as string[]);
        case 'gt':
            return sql`${performanceDaily.bucketDate} > ${filter.value as string}`;
        case 'gte':
            return gte(performanceDaily.bucketDate, filter.value as string);
        case 'lt':
            return sql`${performanceDaily.bucketDate} < ${filter.value as string}`;
        case 'lte':
            return lte(performanceDaily.bucketDate, filter.value as string);
        default:
            throw new Error('The daily target archive does not support this segment operator.');
    }
};

const toTargetMetricTotals = (row: Pick<TargetSearchDatabaseRow, 'impressions' | 'clicks' | 'spend' | 'orders' | 'sales'>): SearchMetricTotals => ({
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    spend: toNumber(row.spend),
    orders: toNumber(row.orders),
    sales: toNumber(row.sales),
});

const normalizeTargetType = (value: string, keyword: string | null, asin: string | null) => {
    const upper = value.toUpperCase();
    if (upper === 'AUTO' || upper.startsWith('AUTO')) {
        return 'AUTO';
    }
    if (asin !== null || upper === 'PRODUCT' || upper.startsWith('PRODUCT') || upper.includes('ASIN')) {
        return 'PRODUCT';
    }
    if (keyword !== null || upper === 'KEYWORD' || upper.includes('KEYWORD')) {
        return 'KEYWORD';
    }
    return 'KEYWORD';
};

const normalizeTargetingMode = (value: string, type: 'AUTO' | 'KEYWORD' | 'PRODUCT') => {
    switch (value.toUpperCase()) {
        case 'AUTO':
            return 'AUTO';
        case 'MANUAL_KEYWORD':
            return 'MANUAL_KEYWORD';
        case 'MANUAL_PRODUCT':
            return 'MANUAL_PRODUCT';
        case 'MANUAL':
            return type === 'KEYWORD' ? 'MANUAL_KEYWORD' : type === 'PRODUCT' ? 'MANUAL_PRODUCT' : null;
        default:
            return null;
    }
};

const normalizeBidStrategy = (value: string | null) => {
    switch (value?.toUpperCase()) {
        case 'MANUAL':
        case 'FIXED':
            return 'FIXED';
        case 'SALES_UP_AND_DOWN':
        case 'DYNAMIC_UP_AND_DOWN':
            return 'DYNAMIC_UP_AND_DOWN';
        case 'LEGACY_FOR_SALES':
        case 'SALES_DOWN_ONLY':
        case 'DYNAMIC_DOWN_ONLY':
            return 'DYNAMIC_DOWN_ONLY';
        default:
            return null;
    }
};

const toNumber = (value: number | string | null) => (value === null ? 0 : Number(value));

const toDateString = (value: string | Date) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value));

const getDateSequence = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    let current = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    while (current <= end) {
        dates.push(current.toISOString().slice(0, 10));
        current = addDays(current, 1);
    }
    return dates;
};
