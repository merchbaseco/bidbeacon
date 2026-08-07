import { addDays } from 'date-fns';
import { and, asc, eq, gt, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { ad, adGroup, campaign, performanceDaily, performanceHourly, target } from '@/db/schema';
import { queryChangeEventSearchRows } from './change-event-search-query';
import type { OperationContext } from './operation-context';
import { queryCampaignPlacementSearchRows } from './placement-search-query';
import { serializeSearchValue } from './search-cursor';
import { isSearchSegmentField } from './search-field-registry';
import type { CampaignSearchPlan, SearchFilter, SearchOrder, SearchPlan } from './search-planner';
import { queryTargetSearchRows } from './target-search-query';

type CampaignRow = typeof campaign.$inferSelect;
type CampaignSettings = Pick<CampaignRow, 'campaignId' | 'name' | 'state' | 'deliveryStatus' | 'budgetAmount' | 'targetingSettings' | 'bidStrategy' | 'startDate' | 'endDate'>;

type MetricTotals = {
    impressions: number;
    clicks: number;
    spend: number;
    orders: number;
    sales: number;
};

export type SearchRow = {
    values: Record<string, unknown>;
};

export type CampaignSearchRow = SearchRow;

export const querySearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    if (plan.resource === 'campaign') {
        return queryCampaignSearchRows(context, account, plan as CampaignSearchPlan);
    }
    if (plan.resource === 'ad_group') {
        return queryAdGroupSearchRows(context, account, plan);
    }
    if (plan.resource === 'ad') {
        return queryAdSearchRows(context, account, plan);
    }
    if (plan.resource === 'target') {
        return queryTargetSearchRows(context, account, plan);
    }
    if (plan.resource === 'change_event') {
        return queryChangeEventSearchRows(context, account, plan);
    }
    return queryProductSearchRows(context, account, plan);
};

type SearchAncestorSettings = {
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

type AdGroupSearchSettings = SearchAncestorSettings & {
    adGroupId: string;
    adGroupName: string;
    adGroupState: string;
    adGroupDeliveryStatus: string;
    adGroupDefaultBid: string | null;
};

type AdSearchSettings = AdGroupSearchSettings & {
    adId: string;
    adState: string;
    adDeliveryStatus: string;
    adAsin: string | null;
    adProductTitle: string | null;
    adType: string;
};

type ProductSearchSettings = {
    productAsin: string;
    productTitle: string | null;
};

type ProductPerformanceRow = {
    productAsin: string;
    bucketDate: string | null;
    bucketHour: number | null;
    impressions: number | string | null;
    clicks: number | string | null;
    spend: number | string | null;
    orders: number | string | null;
    sales: number | string | null;
};

type SearchPerformanceDatabaseRow<TSettings> = TSettings & {
    bucketDate: string | null;
    bucketHour: number | null;
    impressions: number | string | null;
    clicks: number | string | null;
    spend: number | string | null;
    orders: number | string | null;
    sales: number | string | null;
};

const queryProductSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    const settingsRows = await queryProductSettingsRows(context, account);
    if (!plan.performance) {
        return settingsRows.map(row => buildProductSearchRow(row, emptyMetrics(), null, null));
    }

    const performanceRows = await queryProductPerformanceRows(context, account, plan);
    const rowsBySegment = new Map(performanceRows.map(row => [`${row.productAsin}\u0000${row.bucketDate}\u0000${row.bucketHour}`, row]));
    const totalsByProduct = new Map(performanceRows.map(row => [row.productAsin, toMetricTotals(row)]));

    if (!plan.segmented) {
        return settingsRows.map(row => buildProductSearchRow(row, totalsByProduct.get(row.productAsin) ?? emptyMetrics(), null, null));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    return settingsRows.flatMap(row => {
        if (plan.segmentFields.includes('segments.hour')) {
            return dates.flatMap(date =>
                Array.from({ length: 24 }, (_, hour) => {
                    const segment = rowsBySegment.get(`${row.productAsin}\u0000${date}\u0000${hour}`);
                    return buildProductSearchRow(row, segment ? toMetricTotals(segment) : emptyMetrics(), date, hour);
                })
            );
        }
        return dates.map(date => {
            const segment = rowsBySegment.get(`${row.productAsin}\u0000${date}\u0000null`);
            return buildProductSearchRow(row, segment ? toMetricTotals(segment) : emptyMetrics(), date, null);
        });
    });
};

const queryProductSettingsRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }): Promise<ProductSearchSettings[]> => {
    const rows = await context.db
        .select({ productAsin: ad.productAsin, productTitle: ad.productTitle, adId: ad.adId })
        .from(ad)
        .innerJoin(adGroup, eq(adGroup.adGroupId, ad.adGroupId))
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, ad.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .where(and(eq(ad.adProduct, 'SPONSORED_PRODUCTS'), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'), isNotNull(ad.productAsin)))
        .orderBy(asc(ad.productAsin), asc(ad.adId));

    const products = new Map<string, ProductSearchSettings>();
    for (const row of rows) {
        if (!row.productAsin) {
            continue;
        }
        const current = products.get(row.productAsin);
        if (!current || (current.productTitle === null && row.productTitle !== null)) {
            products.set(row.productAsin, { productAsin: row.productAsin, productTitle: row.productTitle });
        }
    }
    return [...products.values()];
};

const queryProductPerformanceRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<ProductPerformanceRow[]> => {
    if (plan.hourly) {
        const metrics = {
            impressions: sql<number>`coalesce(sum(${performanceHourly.impressions}), 0)`.as('impressions'),
            clicks: sql<number>`coalesce(sum(${performanceHourly.clicks}), 0)`.as('clicks'),
            spend: sql<number>`coalesce(sum(${performanceHourly.spend}), 0)`.as('spend'),
            orders: sql<number>`coalesce(sum(${performanceHourly.purchases}), 0)`.as('orders'),
            sales: sql<number>`coalesce(sum(${performanceHourly.sales}), 0)`.as('sales'),
        };
        const rows = await context.db
            .select({
                productAsin: performanceHourly.entityId,
                bucketDate: plan.segmentFields.includes('segments.date') ? performanceHourly.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
                bucketHour: plan.segmentFields.includes('segments.hour') ? performanceHourly.bucketHour : sql<number | null>`NULL`.as('bucket_hour'),
                impressions: metrics.impressions,
                clicks: metrics.clicks,
                spend: metrics.spend,
                orders: metrics.orders,
                sales: metrics.sales,
            })
            .from(performanceHourly)
            .innerJoin(
                ad,
                and(eq(ad.adId, performanceHourly.adId), eq(ad.campaignId, performanceHourly.campaignId), eq(ad.productAsin, performanceHourly.entityId), eq(ad.adProduct, 'SPONSORED_PRODUCTS'))
            )
            .innerJoin(adGroup, and(eq(adGroup.adGroupId, ad.adGroupId), eq(adGroup.campaignId, ad.campaignId), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
            .innerJoin(
                campaign,
                and(
                    eq(campaign.campaignId, performanceHourly.campaignId),
                    eq(campaign.accountId, account.adsAccountId),
                    eq(campaign.countryCode, account.countryCode),
                    eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
                )
            )
            .where(
                and(
                    eq(performanceHourly.accountId, account.adsAccountId),
                    eq(performanceHourly.entityType, 'product'),
                    gte(performanceHourly.bucketDate, plan.dateRange?.startDate ?? ''),
                    lte(performanceHourly.bucketDate, plan.dateRange?.endDate ?? ''),
                    ...plan.filters.filter(filter => isSearchSegmentField(filter.field)).map(buildHourlySegmentCondition)
                )
            )
            .groupBy(
                performanceHourly.entityId,
                ...(plan.segmentFields.includes('segments.date') ? [performanceHourly.bucketDate] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [performanceHourly.bucketHour] : [])
            )
            .orderBy(
                asc(performanceHourly.entityId),
                ...(plan.segmentFields.includes('segments.date') ? [asc(performanceHourly.bucketDate)] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [asc(performanceHourly.bucketHour)] : [])
            );
        return rows;
    }

    const metrics = {
        impressions: sql<number>`coalesce(sum(${performanceDaily.impressions}), 0)`.as('impressions'),
        clicks: sql<number>`coalesce(sum(${performanceDaily.clicks}), 0)`.as('clicks'),
        spend: sql<number>`coalesce(sum(${performanceDaily.spend}), 0)`.as('spend'),
        orders: sql<number>`coalesce(sum(${performanceDaily.purchases}), 0)`.as('orders'),
        sales: sql<number>`coalesce(sum(${performanceDaily.sales}), 0)`.as('sales'),
    };
    const rows = await context.db
        .select({
            productAsin: performanceDaily.entityId,
            bucketDate: plan.segmentFields.includes('segments.date') ? performanceDaily.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
            bucketHour: sql<number | null>`NULL`.as('bucket_hour'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(performanceDaily)
        .innerJoin(ad, and(eq(ad.adId, performanceDaily.adId), eq(ad.campaignId, performanceDaily.campaignId), eq(ad.productAsin, performanceDaily.entityId), eq(ad.adProduct, 'SPONSORED_PRODUCTS')))
        .innerJoin(adGroup, and(eq(adGroup.adGroupId, ad.adGroupId), eq(adGroup.campaignId, ad.campaignId), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
        .innerJoin(
            campaign,
            and(
                eq(campaign.campaignId, performanceDaily.campaignId),
                eq(campaign.accountId, account.adsAccountId),
                eq(campaign.countryCode, account.countryCode),
                eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
            )
        )
        .where(
            and(
                eq(performanceDaily.accountId, account.adsAccountId),
                eq(performanceDaily.entityType, 'product'),
                gte(performanceDaily.bucketDate, plan.dateRange?.startDate ?? ''),
                lte(performanceDaily.bucketDate, plan.dateRange?.endDate ?? ''),
                ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildDailySegmentCondition)
            )
        )
        .groupBy(performanceDaily.entityId, ...(plan.segmentFields.includes('segments.date') ? [performanceDaily.bucketDate] : []))
        .orderBy(asc(performanceDaily.entityId), ...(plan.segmentFields.includes('segments.date') ? [asc(performanceDaily.bucketDate)] : []));
    return rows;
};

const queryAdGroupSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    const rows = plan.performance ? await queryAdGroupPerformanceRows(context, account, plan) : await queryAdGroupSettingsRows(context, account);
    const targetingModes = await queryManualTargetingModes(context, rows, plan);
    if (!plan.segmented) {
        return rows.map(row => buildAdGroupSearchRow(row, plan.performance ? toMetricTotals(row) : emptyMetrics(), null, null, targetingModes.get(row.campaignId)));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    const rowsBySegment = new Map(rows.map(row => [`${row.adGroupId}\u0000${row.bucketDate}\u0000${row.bucketHour}`, row]));
    const rowsByAdGroup = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        if (!rowsByAdGroup.has(row.adGroupId)) {
            rowsByAdGroup.set(row.adGroupId, row);
        }
    }

    return [...rowsByAdGroup.values()].flatMap(row => {
        if (plan.segmentFields.includes('segments.hour')) {
            return dates.flatMap(date =>
                Array.from({ length: 24 }, (_, hour) => {
                    const segment = rowsBySegment.get(`${row.adGroupId}\u0000${date}\u0000${hour}`);
                    return buildAdGroupSearchRow(segment ?? row, segment ? toMetricTotals(segment) : emptyMetrics(), date, hour, targetingModes.get(row.campaignId));
                })
            );
        }
        return dates.map(date => {
            const segment = rowsBySegment.get(`${row.adGroupId}\u0000${date}\u0000null`);
            return buildAdGroupSearchRow(segment ?? row, segment ? toMetricTotals(segment) : emptyMetrics(), date, null, targetingModes.get(row.campaignId));
        });
    });
};

const queryAdSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: SearchPlan): Promise<SearchRow[]> => {
    const rows = plan.performance ? await queryAdPerformanceRows(context, account, plan) : await queryAdSettingsRows(context, account);
    const targetingModes = await queryManualTargetingModes(context, rows, plan);
    if (!plan.segmented) {
        return rows.map(row => buildAdSearchRow(row, plan.performance ? toMetricTotals(row) : emptyMetrics(), null, null, targetingModes.get(row.campaignId)));
    }

    const dates = getDateSequence(plan.dateRange?.startDate ?? '', plan.dateRange?.endDate ?? '');
    const rowsBySegment = new Map(rows.map(row => [`${row.adId}\u0000${row.bucketDate}\u0000${row.bucketHour}`, row]));
    const rowsByAd = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
        if (!rowsByAd.has(row.adId)) {
            rowsByAd.set(row.adId, row);
        }
    }

    return [...rowsByAd.values()].flatMap(row => {
        if (plan.segmentFields.includes('segments.hour')) {
            return dates.flatMap(date =>
                Array.from({ length: 24 }, (_, hour) => {
                    const segment = rowsBySegment.get(`${row.adId}\u0000${date}\u0000${hour}`);
                    return buildAdSearchRow(segment ?? row, segment ? toMetricTotals(segment) : emptyMetrics(), date, hour, targetingModes.get(row.campaignId));
                })
            );
        }
        return dates.map(date => {
            const segment = rowsBySegment.get(`${row.adId}\u0000${date}\u0000null`);
            return buildAdSearchRow(segment ?? row, segment ? toMetricTotals(segment) : emptyMetrics(), date, null, targetingModes.get(row.campaignId));
        });
    });
};

const queryAdGroupSettingsRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }): Promise<SearchPerformanceDatabaseRow<AdGroupSearchSettings>[]> => {
    const rows = await context.db
        .select({
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
            bucketHour: sql<number | null>`NULL`.as('bucket_hour'),
            impressions: sql<number>`0`.as('impressions'),
            clicks: sql<number>`0`.as('clicks'),
            spend: sql<number>`0`.as('spend'),
            orders: sql<number>`0`.as('orders'),
            sales: sql<number>`0`.as('sales'),
        })
        .from(adGroup)
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, adGroup.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .where(eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'))
        .orderBy(asc(adGroup.adGroupId));
    return rows;
};

const queryAdSettingsRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }): Promise<SearchPerformanceDatabaseRow<AdSearchSettings>[]> => {
    const rows = await context.db
        .select({
            adId: ad.adId,
            adState: ad.state,
            adDeliveryStatus: ad.deliveryStatus,
            adAsin: ad.productAsin,
            adProductTitle: ad.productTitle,
            adType: ad.adType,
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
            bucketHour: sql<number | null>`NULL`.as('bucket_hour'),
            impressions: sql<number>`0`.as('impressions'),
            clicks: sql<number>`0`.as('clicks'),
            spend: sql<number>`0`.as('spend'),
            orders: sql<number>`0`.as('orders'),
            sales: sql<number>`0`.as('sales'),
        })
        .from(ad)
        .innerJoin(adGroup, eq(adGroup.adGroupId, ad.adGroupId))
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, ad.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .where(and(eq(ad.adProduct, 'SPONSORED_PRODUCTS'), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
        .orderBy(asc(ad.adId));
    return rows;
};

const queryAdGroupPerformanceRows = async (
    context: OperationContext,
    account: { adsAccountId: string; countryCode: string },
    plan: SearchPlan
): Promise<SearchPerformanceDatabaseRow<AdGroupSearchSettings>[]> => {
    if (plan.hourly) {
        const metrics = {
            impressions: sql<number>`coalesce(sum(${performanceHourly.impressions}), 0)`.as('impressions'),
            clicks: sql<number>`coalesce(sum(${performanceHourly.clicks}), 0)`.as('clicks'),
            spend: sql<number>`coalesce(sum(${performanceHourly.spend}), 0)`.as('spend'),
            orders: sql<number>`coalesce(sum(${performanceHourly.purchases}), 0)`.as('orders'),
            sales: sql<number>`coalesce(sum(${performanceHourly.sales}), 0)`.as('sales'),
        };
        const archiveJoin = and(
            eq(performanceHourly.accountId, account.adsAccountId),
            eq(performanceHourly.adGroupId, adGroup.adGroupId),
            eq(performanceHourly.entityType, 'product'),
            gte(performanceHourly.bucketDate, plan.dateRange?.startDate ?? ''),
            lte(performanceHourly.bucketDate, plan.dateRange?.endDate ?? ''),
            ...plan.filters.filter(filter => isSearchSegmentField(filter.field)).map(buildHourlySegmentCondition)
        );
        const rows = await context.db
            .select({
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
                bucketDate: plan.segmentFields.includes('segments.date') ? performanceHourly.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
                bucketHour: plan.segmentFields.includes('segments.hour') ? performanceHourly.bucketHour : sql<number | null>`NULL`.as('bucket_hour'),
                impressions: metrics.impressions,
                clicks: metrics.clicks,
                spend: metrics.spend,
                orders: metrics.orders,
                sales: metrics.sales,
            })
            .from(adGroup)
            .innerJoin(
                campaign,
                and(
                    eq(campaign.campaignId, adGroup.campaignId),
                    eq(campaign.accountId, account.adsAccountId),
                    eq(campaign.countryCode, account.countryCode),
                    eq(campaign.adProduct, 'SPONSORED_PRODUCTS')
                )
            )
            .leftJoin(performanceHourly, archiveJoin)
            .where(eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'))
            .groupBy(
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
                ...(plan.segmentFields.includes('segments.date') ? [performanceHourly.bucketDate] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [performanceHourly.bucketHour] : [])
            )
            .orderBy(
                asc(adGroup.adGroupId),
                ...(plan.segmentFields.includes('segments.date') ? [asc(performanceHourly.bucketDate)] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [asc(performanceHourly.bucketHour)] : [])
            );
        return rows;
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
        eq(performanceDaily.adGroupId, adGroup.adGroupId),
        eq(performanceDaily.entityType, 'product'),
        gte(performanceDaily.bucketDate, plan.dateRange?.startDate ?? ''),
        lte(performanceDaily.bucketDate, plan.dateRange?.endDate ?? ''),
        ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildDailySegmentCondition)
    );
    const rows = await context.db
        .select({
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
            bucketHour: sql<number | null>`NULL`.as('bucket_hour'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(adGroup)
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, adGroup.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .leftJoin(performanceDaily, archiveJoin)
        .where(eq(adGroup.adProduct, 'SPONSORED_PRODUCTS'))
        .groupBy(
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
        .orderBy(asc(adGroup.adGroupId), ...(plan.segmented ? [asc(performanceDaily.bucketDate)] : []));
    return rows;
};

const queryAdPerformanceRows = async (
    context: OperationContext,
    account: { adsAccountId: string; countryCode: string },
    plan: SearchPlan
): Promise<SearchPerformanceDatabaseRow<AdSearchSettings>[]> => {
    if (plan.hourly) {
        const metrics = {
            impressions: sql<number>`coalesce(sum(${performanceHourly.impressions}), 0)`.as('impressions'),
            clicks: sql<number>`coalesce(sum(${performanceHourly.clicks}), 0)`.as('clicks'),
            spend: sql<number>`coalesce(sum(${performanceHourly.spend}), 0)`.as('spend'),
            orders: sql<number>`coalesce(sum(${performanceHourly.purchases}), 0)`.as('orders'),
            sales: sql<number>`coalesce(sum(${performanceHourly.sales}), 0)`.as('sales'),
        };
        const archiveJoin = and(
            eq(performanceHourly.accountId, account.adsAccountId),
            eq(performanceHourly.adId, ad.adId),
            eq(performanceHourly.entityType, 'product'),
            gte(performanceHourly.bucketDate, plan.dateRange?.startDate ?? ''),
            lte(performanceHourly.bucketDate, plan.dateRange?.endDate ?? ''),
            ...plan.filters.filter(filter => isSearchSegmentField(filter.field)).map(buildHourlySegmentCondition)
        );
        const rows = await context.db
            .select({
                adId: ad.adId,
                adState: ad.state,
                adDeliveryStatus: ad.deliveryStatus,
                adAsin: ad.productAsin,
                adProductTitle: ad.productTitle,
                adType: ad.adType,
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
                bucketDate: plan.segmentFields.includes('segments.date') ? performanceHourly.bucketDate : sql<string | null>`NULL`.as('bucket_date'),
                bucketHour: plan.segmentFields.includes('segments.hour') ? performanceHourly.bucketHour : sql<number | null>`NULL`.as('bucket_hour'),
                impressions: metrics.impressions,
                clicks: metrics.clicks,
                spend: metrics.spend,
                orders: metrics.orders,
                sales: metrics.sales,
            })
            .from(ad)
            .innerJoin(adGroup, eq(adGroup.adGroupId, ad.adGroupId))
            .innerJoin(
                campaign,
                and(eq(campaign.campaignId, ad.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
            )
            .leftJoin(performanceHourly, archiveJoin)
            .where(and(eq(ad.adProduct, 'SPONSORED_PRODUCTS'), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
            .groupBy(
                ad.adId,
                ad.state,
                ad.deliveryStatus,
                ad.productAsin,
                ad.productTitle,
                ad.adType,
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
                ...(plan.segmentFields.includes('segments.date') ? [performanceHourly.bucketDate] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [performanceHourly.bucketHour] : [])
            )
            .orderBy(
                asc(ad.adId),
                ...(plan.segmentFields.includes('segments.date') ? [asc(performanceHourly.bucketDate)] : []),
                ...(plan.segmentFields.includes('segments.hour') ? [asc(performanceHourly.bucketHour)] : [])
            );
        return rows;
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
        eq(performanceDaily.adId, ad.adId),
        eq(performanceDaily.entityType, 'product'),
        gte(performanceDaily.bucketDate, plan.dateRange?.startDate ?? ''),
        lte(performanceDaily.bucketDate, plan.dateRange?.endDate ?? ''),
        ...plan.filters.filter(filter => filter.field === 'segments.date').map(buildDailySegmentCondition)
    );
    const rows = await context.db
        .select({
            adId: ad.adId,
            adState: ad.state,
            adDeliveryStatus: ad.deliveryStatus,
            adAsin: ad.productAsin,
            adProductTitle: ad.productTitle,
            adType: ad.adType,
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
            bucketHour: sql<number | null>`NULL`.as('bucket_hour'),
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            spend: metrics.spend,
            orders: metrics.orders,
            sales: metrics.sales,
        })
        .from(ad)
        .innerJoin(adGroup, eq(adGroup.adGroupId, ad.adGroupId))
        .innerJoin(
            campaign,
            and(eq(campaign.campaignId, ad.campaignId), eq(campaign.accountId, account.adsAccountId), eq(campaign.countryCode, account.countryCode), eq(campaign.adProduct, 'SPONSORED_PRODUCTS'))
        )
        .leftJoin(performanceDaily, archiveJoin)
        .where(and(eq(ad.adProduct, 'SPONSORED_PRODUCTS'), eq(adGroup.adProduct, 'SPONSORED_PRODUCTS')))
        .groupBy(
            ad.adId,
            ad.state,
            ad.deliveryStatus,
            ad.productAsin,
            ad.productTitle,
            ad.adType,
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
        .orderBy(asc(ad.adId), ...(plan.segmented ? [asc(performanceDaily.bucketDate)] : []));
    return rows;
};

const buildAdGroupSearchRow = (
    row: SearchPerformanceDatabaseRow<AdGroupSearchSettings>,
    totals: MetricTotals,
    date: string | null,
    hour: number | null,
    inferredTargetingMode?: 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT'
): SearchRow => {
    const metrics = buildMetricValues(totals);
    return {
        values: {
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
            'campaign.targetingMode': normalizeTargetingMode(row.campaignTargetingSettings, inferredTargetingMode),
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
            'segments.hour': hour,
        },
    };
};

const buildAdSearchRow = (
    row: SearchPerformanceDatabaseRow<AdSearchSettings>,
    totals: MetricTotals,
    date: string | null,
    hour: number | null,
    inferredTargetingMode?: 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT'
): SearchRow => {
    const metrics = buildMetricValues(totals);
    return {
        values: {
            'ad.id': row.adId,
            'ad.state': row.adState,
            'ad.deliveryStatus': row.adDeliveryStatus,
            'ad.asin': row.adAsin,
            'ad.productTitle': row.adProductTitle,
            'ad.type': row.adType,
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
            'campaign.targetingMode': normalizeTargetingMode(row.campaignTargetingSettings, inferredTargetingMode),
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
            'segments.hour': hour,
        },
    };
};

const buildProductSearchRow = (row: ProductSearchSettings, totals: MetricTotals, date: string | null, hour: number | null): SearchRow => {
    const metrics = buildMetricValues(totals);
    return {
        values: {
            'product.asin': row.productAsin,
            'product.title': row.productTitle,
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
            'segments.hour': hour,
        },
    };
};

const buildDailySegmentCondition = (filter: SearchFilter) => {
    if (filter.field !== 'segments.date') {
        throw new Error('Only segments.date filters can constrain the daily advertised-ASIN archive.');
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
            throw new Error('The daily advertised-ASIN archive does not support this segment operator.');
    }
};

const buildHourlySegmentCondition = (filter: SearchFilter) => {
    if (filter.field === 'segments.date') {
        switch (filter.operator) {
            case 'eq':
                return eq(performanceHourly.bucketDate, filter.value as string);
            case 'in':
                return inArray(performanceHourly.bucketDate, filter.value as string[]);
            case 'gt':
                return gt(performanceHourly.bucketDate, filter.value as string);
            case 'gte':
                return gte(performanceHourly.bucketDate, filter.value as string);
            case 'lt':
                return lt(performanceHourly.bucketDate, filter.value as string);
            case 'lte':
                return lte(performanceHourly.bucketDate, filter.value as string);
            default:
                throw new Error('The hourly advertised-ASIN archive does not support this date operator.');
        }
    }
    if (filter.field === 'segments.hour') {
        switch (filter.operator) {
            case 'eq':
                return eq(performanceHourly.bucketHour, filter.value as number);
            case 'in':
                return inArray(performanceHourly.bucketHour, filter.value as number[]);
            case 'gt':
                return gt(performanceHourly.bucketHour, filter.value as number);
            case 'gte':
                return gte(performanceHourly.bucketHour, filter.value as number);
            case 'lt':
                return lt(performanceHourly.bucketHour, filter.value as number);
            case 'lte':
                return lte(performanceHourly.bucketHour, filter.value as number);
            default:
                throw new Error('The hourly advertised-ASIN archive does not support this hour operator.');
        }
    }
    throw new Error('Only segments.date and segments.hour filters can constrain the hourly advertised-ASIN archive.');
};

export const queryCampaignSearchRows = async (context: OperationContext, account: { adsAccountId: string; countryCode: string }, plan: CampaignSearchPlan): Promise<CampaignSearchRow[]> => {
    if (plan.placement) {
        return queryCampaignPlacementSearchRows(context, account, plan);
    }

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

export const filterSearchRows = (rows: readonly SearchRow[], filters: readonly SearchFilter[], segmentFields: readonly string[]) =>
    rows.filter(row => filters.every(filter => (isSearchSegmentField(filter.field) && !segmentFields.includes(filter.field)) || matchesFilter(row.values[filter.field], filter)));

export const filterCampaignSearchRows = (rows: readonly CampaignSearchRow[], filters: readonly SearchFilter[], segmentFields: readonly string[]) => filterSearchRows(rows, filters, segmentFields);

export const sortSearchRows = (rows: readonly SearchRow[], orderBy: readonly SearchOrder[]) => [...rows].sort((left, right) => compareSearchRows(left, right, orderBy));

export const sortCampaignSearchRows = (rows: readonly CampaignSearchRow[], orderBy: readonly SearchOrder[]) => sortSearchRows(rows, orderBy);

export const compareSearchRows = (left: SearchRow, right: SearchRow, orderBy: readonly SearchOrder[]) => {
    for (const order of orderBy) {
        const comparison = compareValues(left.values[order.field], right.values[order.field]);
        if (comparison !== 0) {
            return order.direction === 'asc' ? comparison : -comparison;
        }
    }
    return 0;
};

export const compareSearchRowToBoundary = (row: SearchRow, boundary: readonly unknown[], orderBy: readonly SearchOrder[]) => {
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

const matchesFilter = (actual: unknown, filter: SearchFilter) => {
    if (actual === undefined) {
        return false;
    }
    if (actual === null) {
        return filter.operator === 'eq' ? filter.value === null : filter.operator === 'in' && Array.isArray(filter.value) && filter.value.includes(null);
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
    const serializedLeft = serializeSearchValue(left);
    const serializedRight = serializeSearchValue(right);
    if (serializedLeft === serializedRight) {
        return 0;
    }
    return serializedLeft < serializedRight ? -1 : 1;
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

const queryManualTargetingModes = async (
    context: OperationContext,
    campaignRows: readonly (Pick<CampaignRow, 'campaignId' | 'targetingSettings'> | Pick<SearchAncestorSettings, 'campaignId' | 'campaignTargetingSettings'>)[],
    plan: SearchPlan
): Promise<Map<string, 'MANUAL_KEYWORD' | 'MANUAL_PRODUCT'>> => {
    const targetingModeUsed =
        plan.fields.includes('campaign.targetingMode') ||
        plan.filters.some(filter => filter.field === 'campaign.targetingMode') ||
        plan.orderBy.some(order => order.field === 'campaign.targetingMode');
    if (!targetingModeUsed) {
        return new Map();
    }

    const manualCampaignIds = [
        ...new Set(campaignRows.filter(row => ('targetingSettings' in row ? row.targetingSettings : row.campaignTargetingSettings).toUpperCase() === 'MANUAL').map(row => row.campaignId)),
    ];
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
