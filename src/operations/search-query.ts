import { addDays } from 'date-fns';
import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { campaign, performanceDaily, target } from '@/db/schema';
import type { OperationContext } from './operation-context';
import type { CampaignSearchPlan, SearchFilter, SearchOrder } from './search-planner';

type CampaignRow = typeof campaign.$inferSelect;
type CampaignSettings = Pick<CampaignRow, 'campaignId' | 'name' | 'state' | 'deliveryStatus' | 'budgetAmount' | 'targetingSettings' | 'bidStrategy' | 'startDate' | 'endDate'>;

type MetricTotals = {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
};

export type CampaignSearchRow = {
    values: Record<string, string | number | null>;
};

export const queryCampaignSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: CampaignSearchPlan): Promise<CampaignSearchRow[]> => {
    if (!plan.performance) {
        const campaignRows = await context.db
            .select()
            .from(campaign)
            .where(and(eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS')))
            .orderBy(asc(campaign.campaignId));
        const targetingModes = await queryManualTargetingModes(context, campaignRows, plan);
        return campaignRows.map(row => buildSearchRow(row, emptyMetrics(), null, targetingModes.get(row.campaignId)));
    }

    const metrics = {
        impressions: sql<number>`coalesce(sum(${performanceDaily.impressions}), 0)`.as('impressions'),
        clicks: sql<number>`coalesce(sum(${performanceDaily.clicks}), 0)`.as('clicks'),
        spend: sql<number>`coalesce(sum(${performanceDaily.spend}), 0)`.as('spend'),
        orders: sql<number>`coalesce(sum(${performanceDaily.purchases}), 0)`.as('orders'),
        sales: sql<number>`coalesce(sum(${performanceDaily.sales}), 0)`.as('sales'),
    };
    const archiveJoin = and(
        eq(performanceDaily.accountId, account.adsAccountId),
        eq(performanceDaily.campaignId, campaign.campaignId),
        eq(performanceDaily.entityType, 'product'),
        gte(performanceDaily.bucketDate, plan.dateRange?.startDate ?? ''),
        lte(performanceDaily.bucketDate, plan.dateRange?.endDate ?? ''),
        ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildSegmentDateCondition)
    );
    const campaignRows = await context.db
        .select({
            id: campaign.id,
            campaignId: campaign.campaignId,
            accountId: campaign.accountId,
            countryCode: campaign.countryCode,
            name: campaign.name,
            adProduct: campaign.adProduct,
            state: campaign.state,
            deliveryStatus: campaign.deliveryStatus,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            targetingSettings: campaign.targetingSettings,
            bidStrategy: campaign.bidStrategy,
            budgetAmount: campaign.budgetAmount,
            creationDateTime: campaign.creationDateTime,
            lastUpdatedDateTime: campaign.lastUpdatedDateTime,
            bucketDate: plan.segmented ? performanceDaily.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(campaign)
        .leftJoin(performanceDaily, archiveJoin)
        .where(and(eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS')))
        .groupBy(
            campaign.id,
            campaign.campaignId,
            campaign.accountId,
            campaign.countryCode,
            campaign.name,
            campaign.adProduct,
            campaign.state,
            campaign.deliveryStatus,
            campaign.startDate,
            campaign.endDate,
            campaign.targetingSettings,
            campaign.bidStrategy,
            campaign.budgetAmount,
            campaign.creationDateTime,
            campaign.lastUpdatedDateTime,
            ...(plan.segmented ? [performanceDaily.bucketDate] : [])
        )
        .orderBy(asc(campaign.campaignId), ...(plan.segmented ? [asc(performanceDaily.bucketDate)] : []));

    const targetingModes = await queryManualTargetingModes(context, campaignRows, plan);
    if (!plan.segmented) {
        return campaignRows.map(row => buildSearchRow(row, toMetricTotals(row), null, targetingModes.get(row.campaignId)));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    const rowsByCampaignAndDate = new Map(campaignRows.map(row => [`${row.campaignId}\u0000${row.bucketDate}`, row]));
    const campaignRowsById = new Map<string, (typeof campaignRows)[number]>();
    for (const row of campaignRows) {
        if (!campaignRowsById.has(row.campaignId)) {
            campaignRowsById.set(row.campaignId, row);
        }
    }
    return [...campaignRowsById.values()].flatMap(row =>
        dates.map(date => {
            const segmentedRow = rowsByCampaignAndDate.get(`${row.campaignId}\u0000${date}`);
            return buildSearchRow(segmentedRow ?? row, segmentedRow ? toMetricTotals(segmentedRow) : emptyMetrics(), date, targetingModes.get(row.campaignId));
        })
    );
};

export const filterCampaignSearchRows = (rows: readonly CampaignSearchRow[], filters: readonly SearchFilter[], segmented: boolean) =>
    rows.filter(row => filters.every(filter => (!segmented && filter.field === 'segments.date') || matchesFilter(row.values[filter.field], filter)));

export const sortCampaignSearchRows = (rows: readonly CampaignSearchRow[], orderBy: readonly SearchOrder[]) => [...rows].sort((left, right) => compareSearchRows(left, right, orderBy));

export const compareSearchRows = (left: CampaignSearchRow, right: CampaignSearchRow, orderBy: readonly SearchOrder[]) => {
    for (const order of orderBy) {
        const comparison = compareValues(left.values[order.field], right.values[order.field]);
        if (comparison !== 0) {
            return order.direction === 'asc' ? comparison : -comparison;
        }
    }
    return 0;
};

export const compareSearchRowToBoundary = (row: CampaignSearchRow, boundary: readonly unknown[], orderBy: readonly SearchOrder[]) => {
    for (const [index, order] of orderBy.entries()) {
        const comparison = compareValues(row.values[order.field], boundary[index]);
        if (comparison !== 0) {
            return order.direction === 'asc' ? comparison : -comparison;
        }
    }
    return 0;
};

const toMetricTotals = (row: {
    impressions: number | string | null;
    clicks: number | string | null;
    spend: number | string | null;
    orders: number | string | null;
    sales: number | string | null;
}): MetricTotals => ({
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    spend: toNumber(row.spend),
    orders: toNumber(row.orders),
    sales: toNumber(row.sales),
});

const buildSegmentDateCondition = (filter: SearchFilter) => {
    if (filter.field !== 'segments.date') {
        throw new Error('Only segments.date filters can constrain the Campaign archive.');
    }
    switch (filter.operator) {
        case 'eq':
            return eq(performanceDaily.bucketDate, filter.value as string);
        case 'in':
            return inArray(performanceDaily.bucketDate, filter.value as string[]);
        case 'gt':
            return gt(performanceDaily.bucketDate, filter.value as string);
        case 'gte':
            return gte(performanceDaily.bucketDate, filter.value as string);
        case 'lt':
            return lt(performanceDaily.bucketDate, filter.value as string);
        case 'lte':
            return lte(performanceDaily.bucketDate, filter.value as string);
        default:
            throw new Error('The Campaign archive does not support this segments.date operator.');
    }
};

const buildSearchRow = (row: CampaignSettings, totals: MetricTotals, date: string | null, inferredTargetingMode?: 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT'): CampaignSearchRow => {
    const metrics = buildMetricValues(totals);
    return {
        values: {
            'campaign.id': row.campaignId,
            'campaign.name': row.name,
            'campaign.state': row.state,
            'campaign.deliveryStatus': row.deliveryStatus,
            'campaign.dailyBudget': row.budgetAmount === null ? null : toNumber(row.budgetAmount),
            'campaign.targetingMode': normalizeTargetingMode(row.targetingSettings, inferredTargetingMode),
            'campaign.bidStrategy': normalizeBidStrategy(row.bidStrategy),
            'campaign.startDate': toDateString(row.startDate),
            'campaign.endDate': row.endDate ? toDateString(row.endDate) : null,
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
    };
};

const buildMetricValues = (totals: MetricTotals) => ({
    impressions: totals.impressions,
    clicks: totals.clicks,
    spend: roundMetric(totals.spend),
    orders: totals.orders,
    sales: roundMetric(totals.sales),
    acos: ratioAsPercentage(totals.spend, totals.sales),
    cpc: ratio(totals.spend, totals.clicks),
    ctr: ratioAsPercentage(totals.clicks, totals.impressions),
    roas: ratio(totals.sales, totals.spend),
    cvr: ratioAsPercentage(totals.orders, totals.clicks),
});

const matchesFilter = (actual: string | number | null | undefined, filter: SearchFilter) => {
    if (actual === undefined || actual === null) {
        return false;
    }
    if (filter.operator === 'contains') {
        return String(actual).toLocaleLowerCase().includes(String(filter.value).toLocaleLowerCase());
    }
    if (filter.operator === 'in') {
        return Array.isArray(filter.value) && filter.value.some(value => compareValues(actual, value) === 0);
    }

    const comparison = compareValues(actual, filter.value);
    switch (filter.operator) {
        case 'eq':
            return comparison === 0;
        case 'gt':
            return comparison > 0;
        case 'gte':
            return comparison >= 0;
        case 'lt':
            return comparison < 0;
        case 'lte':
            return comparison <= 0;
        default:
            return false;
    }
};

const compareValues = (left: unknown, right: unknown) => {
    if (left === right) {
        return 0;
    }
    if (left === null || left === undefined) {
        return -1;
    }
    if (right === null || right === undefined) {
        return 1;
    }
    if (typeof left === 'number' && typeof right === 'number') {
        return left < right ? -1 : 1;
    }
    const leftString = String(left);
    const rightString = String(right);
    return leftString < rightString ? -1 : 1;
};

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

const emptyMetrics = (): MetricTotals => ({ impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0 });

const queryManualTargetingModes = async (context: OperationContext, campaignRows: readonly CampaignSettings[], plan: CampaignSearchPlan): Promise<Map<string, 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT'>> => {
    const targetingModeUsed =
        plan.fields.includes('campaign.targetingMode') ||
        plan.filters.some(filter => filter.field === 'campaign.targetingMode') ||
        plan.orderBy.some(order => order.field === 'campaign.targetingMode');
    if (!targetingModeUsed) {
        return new Map();
    }

    const manualCampaignIds = [...new Set(campaignRows.filter(row => row.targetingSettings.toUpperCase() === 'MANUAL').map(row => row.campaignId))];
    if (manualCampaignIds.length === 0) {
        return new Map();
    }

    const targetRows = await context.db
        .select({
            campaignId: target.campaignId,
            targetType: target.targetType,
            targetAsin: target.targetAsin,
            targetKeyword: target.targetKeyword,
        })
        .from(target)
        .where(and(inArray(target.campaignId, manualCampaignIds), eq(target.adProduct, 'SPONSORED_PRODUCTS'), eq(target.negative, false)));
    const evidence = new Map<string, { keyword: boolean; product: boolean }>();
    for (const row of targetRows) {
        const current = evidence.get(row.campaignId) ?? { keyword: false, product: false };
        const targetType = row.targetType.toUpperCase();
        current.keyword ||= row.targetKeyword !== null || targetType === 'KEYWORD';
        current.product ||= row.targetAsin !== null || targetType === 'PRODUCT' || targetType.startsWith('PRODUCT_');
        evidence.set(row.campaignId, current);
    }

    return new Map(
        [...evidence.entries()].flatMap(([campaignId, value]) => {
            if (value.keyword === value.product) {
                return [];
            }
            return [[campaignId, value.keyword ? 'MANUAL_KEYWORD' : 'MANUAL_PRODUCT'] as const];
        })
    );
};

const normalizeTargetingMode = (value: string, inferredMode?: 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT') => {
    switch (value.toUpperCase()) {
        case 'AUTO':
            return 'AUTO';
        case 'MANUAL_KEYWORD':
            return 'MANUAL_KEYWORD';
        case 'MANUAL_PRODUCT':
            return 'MANUAL_PRODUCT';
        case 'MANUAL':
            return inferredMode ?? null;
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

const ratio = (numerator: number, denominator: number) => (denominator === 0 ? 0 : roundMetric(numerator / denominator));

const ratioAsPercentage = (numerator: number, denominator: number) => (denominator === 0 ? 0 : roundMetric((numerator / denominator) * 100));

const roundMetric = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: number | string | null) => (value === null ? 0 : Number(value));

const toDateString = (value: string | Date) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value));
