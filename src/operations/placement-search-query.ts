import { addDays } from 'date-fns';
import { and, asc, eq, gt, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { campaign, performanceDailyPlacement } from '@/db/schema';
import type { Placement } from '@/lib/placement-report/normalize-placement';
import type { OperationContext } from './operation-context';
import type { CampaignSearchPlan, SearchFilter } from './search-planner';
import type { CampaignSearchRow } from './search-query';

type MetricTotals = {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
};

type CampaignSettings = Pick<typeof campaign.$inferSelect, 'campaignId' | 'name' | 'state' | 'deliveryStatus' | 'budgetAmount' | 'targetingSettings' | 'bidStrategy' | 'startDate' | 'endDate'>;

export const queryCampaignPlacementSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: CampaignSearchPlan): Promise<CampaignSearchRow[]> => {
    const placementSegmented = plan.fields.includes('segments.placement') || plan.orderBy.some(order => order.field === 'segments.placement');
    const dateSegmented = plan.fields.includes('segments.date') || plan.orderBy.some(order => order.field === 'segments.date');
    const metrics = {
        impressions: sql<number>`coalesce(sum(${performanceDailyPlacement.impressions}), 0)`.as('impressions'),
        clicks: sql<number>`coalesce(sum(${performanceDailyPlacement.clicks}), 0)`.as('clicks'),
        spend: sql<number>`coalesce(sum(${performanceDailyPlacement.spend}), 0)`.as('spend'),
        orders: sql<number>`coalesce(sum(${performanceDailyPlacement.purchases}), 0)`.as('orders'),
        sales: sql<number>`coalesce(sum(${performanceDailyPlacement.sales}), 0)`.as('sales'),
    };
    const archiveJoin = and(
        eq(performanceDailyPlacement.accountId, account.adsAccountId),
        eq(performanceDailyPlacement.countryCode, account.countryCode),
        eq(performanceDailyPlacement.campaignId, campaign.campaignId),
        gte(performanceDailyPlacement.bucketDate, plan.dateRange?.startDate ?? ''),
        lte(performanceDailyPlacement.bucketDate, plan.dateRange?.endDate ?? ''),
        ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildSegmentDateCondition),
        ...plan.filters.filter(filter => filter.field === 'segments.placement').map(buildSegmentPlacementCondition)
    );
    const rows = await context.db
        .select({
            campaignId: campaign.campaignId,
            name: campaign.name,
            state: campaign.state,
            deliveryStatus: campaign.deliveryStatus,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            targetingSettings: campaign.targetingSettings,
            bidStrategy: campaign.bidStrategy,
            budgetAmount: campaign.budgetAmount,
            bucketDate: dateSegmented ? performanceDailyPlacement.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
            placement: placementSegmented ? performanceDailyPlacement.placement : sql<string | null>`NULL`.as('placement'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(campaign)
        .leftJoin(performanceDailyPlacement, archiveJoin)
        .where(and(eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS')))
        .groupBy(
            campaign.campaignId,
            campaign.name,
            campaign.state,
            campaign.deliveryStatus,
            campaign.startDate,
            campaign.endDate,
            campaign.targetingSettings,
            campaign.bidStrategy,
            campaign.budgetAmount,
            ...(dateSegmented ? [performanceDailyPlacement.bucketDate] : []),
            ...(placementSegmented ? [performanceDailyPlacement.placement] : [])
        )
        .orderBy(asc(campaign.campaignId), ...(dateSegmented ? [asc(performanceDailyPlacement.bucketDate)] : []), ...(placementSegmented ? [asc(performanceDailyPlacement.placement)] : []));

    if (!(dateSegmented || placementSegmented)) {
        return rows.map(row => buildPlacementSearchRow(row, toMetricTotals(row), null, null));
    }

    const campaignRowsById = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        if (!campaignRowsById.has(row.campaignId)) {
            campaignRowsById.set(row.campaignId, row);
        }
    }

    if (!dateSegmented) {
        return rows.filter(row => row.placement !== null).map(row => buildPlacementSearchRow(row, toMetricTotals(row), null, row.placement as Placement));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    if (!placementSegmented) {
        const rowsByCampaignAndDate = new Map(rows.map(row => [`${row.campaignId}\u0000${row.bucketDate}`, row]));
        return [...campaignRowsById.values()].flatMap(row =>
            dates.map(date => {
                const segmentedRow = rowsByCampaignAndDate.get(`${row.campaignId}\u0000${date}`);
                return buildPlacementSearchRow(segmentedRow ?? row, segmentedRow ? toMetricTotals(segmentedRow) : emptyMetrics(), date, null);
            })
        );
    }

    const placementsByCampaign = new Map<string, Set<Placement>>();
    for (const row of rows) {
        if (row.placement) {
            const placements = placementsByCampaign.get(row.campaignId) ?? new Set<Placement>();
            placements.add(row.placement as Placement);
            placementsByCampaign.set(row.campaignId, placements);
        }
    }
    for (const placement of getPlacementFilterValues(plan.filters)) {
        for (const campaignId of campaignRowsById.keys()) {
            const placements = placementsByCampaign.get(campaignId) ?? new Set<Placement>();
            placements.add(placement);
            placementsByCampaign.set(campaignId, placements);
        }
    }

    const rowsByCampaignDatePlacement = new Map(rows.map(row => [`${row.campaignId}\u0000${row.bucketDate}\u0000${row.placement}`, row]));
    return [...campaignRowsById.values()].flatMap(row =>
        [...(placementsByCampaign.get(row.campaignId) ?? [])].sort().flatMap(placement =>
            dates.map(date => {
                const segmentedRow = rowsByCampaignDatePlacement.get(`${row.campaignId}\u0000${date}\u0000${placement}`);
                return buildPlacementSearchRow(segmentedRow ?? row, segmentedRow ? toMetricTotals(segmentedRow) : emptyMetrics(), date, placement);
            })
        )
    );
};

const buildPlacementSearchRow = (row: CampaignSettings, totals: MetricTotals, date: string | null, placement: Placement | null): CampaignSearchRow => {
    const metrics = buildMetricValues(totals);
    return {
        values: {
            'campaign.id': row.campaignId,
            'campaign.name': row.name,
            'campaign.state': row.state,
            'campaign.deliveryStatus': row.deliveryStatus,
            'campaign.dailyBudget': row.budgetAmount === null ? null : toNumber(row.budgetAmount),
            'campaign.targetingMode': normalizeTargetingMode(row.targetingSettings),
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
            'segments.placement': placement,
        },
    };
};

const buildSegmentDateCondition = (filter: SearchFilter) => {
    switch (filter.operator) {
        case 'eq':
            return eq(performanceDailyPlacement.bucketDate, filter.value as string);
        case 'in':
            return inArray(performanceDailyPlacement.bucketDate, filter.value as string[]);
        case 'gt':
            return gt(performanceDailyPlacement.bucketDate, filter.value as string);
        case 'gte':
            return gte(performanceDailyPlacement.bucketDate, filter.value as string);
        case 'lt':
            return lt(performanceDailyPlacement.bucketDate, filter.value as string);
        case 'lte':
            return lte(performanceDailyPlacement.bucketDate, filter.value as string);
        default:
            throw new Error('The Campaign placement archive does not support this segments.date operator.');
    }
};

const buildSegmentPlacementCondition = (filter: SearchFilter) => {
    switch (filter.operator) {
        case 'eq':
            return eq(performanceDailyPlacement.placement, filter.value as string);
        case 'in':
            return inArray(performanceDailyPlacement.placement, filter.value as string[]);
        default:
            throw new Error('The Campaign placement archive only supports equality placement filters.');
    }
};

const getPlacementFilterValues = (filters: readonly SearchFilter[]): Placement[] =>
    filters.filter(filter => filter.field === 'segments.placement').flatMap(filter => (filter.operator === 'in' ? filter.value : [filter.value])) as Placement[];

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

const emptyMetrics = (): MetricTotals => ({ impressions: 0, clicks: 0, spend: 0, orders: 0, sales: 0 });

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

const normalizeTargetingMode = (value: string) => {
    switch (value.toUpperCase()) {
        case 'AUTO':
            return 'AUTO';
        case 'MANUAL_KEYWORD':
            return 'MANUAL_KEYWORD';
        case 'MANUAL_PRODUCT':
            return 'MANUAL_PRODUCT';
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
