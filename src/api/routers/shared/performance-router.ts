import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gte, ilike, lte, or, type SQL, sql } from 'drizzle-orm';
import type { apiProcedure } from '@/api/trpc';
import { router } from '@/api/trpc';
import { db } from '@/db/index';
import { ad, adGroup, campaign, performanceDaily, target } from '@/db/schema';
import { performanceTableInputSchema, performanceTableOutputSchema } from '@/types/performance-api';

export const buildPerformanceRouter = (procedure: typeof apiProcedure) =>
    router({
        table: procedure
            .input(performanceTableInputSchema)
            .output(performanceTableOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const { startDateSql, endDateSql } = parseDateRange(input.range.startDate, input.range.endDate);
                if (startDateSql > endDateSql) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'startDate must be on or before endDate.',
                    });
                }

                const pagination = getPagination(input.pagination?.limit, input.pagination?.cursor);
                const sortField = input.sort?.field ?? 'spend';
                const sortDirection = input.sort?.direction ?? 'desc';

                const baseConditions = [
                    eq(performanceDaily.accountId, input.accountId),
                    gte(performanceDaily.bucketDate, startDateSql),
                    lte(performanceDaily.bucketDate, endDateSql),
                    eq(performanceDaily.entityType, input.metricsEntityType),
                ];

                const filterConditions = buildPerformanceFilters(input.dimension, input.filters);
                const whereConditions = [...baseConditions, ...filterConditions];

                const metricsExpressions = buildMetricExpressions();
                const orderExpression = buildSortExpression(sortField, metricsExpressions);
                const orderDirection = sortDirection === 'asc' ? asc(orderExpression) : desc(orderExpression);

                switch (input.dimension) {
                    case 'campaign': {
                        const searchCondition = buildCampaignSearchCondition(input.filters?.search ?? null);
                        const conditions = [...whereConditions, ...(searchCondition ? [searchCondition] : [])];

                        const rows = await db
                            .select({
                                campaignId: performanceDaily.campaignId,
                                name: campaign.name,
                                state: campaign.state,
                                adProduct: campaign.adProduct,
                                startDate: campaign.startDate,
                                endDate: campaign.endDate,
                                impressions: metricsExpressions.impressions.as('impressions'),
                                clicks: metricsExpressions.clicks.as('clicks'),
                                orders: metricsExpressions.orders.as('orders'),
                                spend: metricsExpressions.spend.as('spend'),
                                sales: metricsExpressions.sales.as('sales'),
                            })
                            .from(performanceDaily)
                            .leftJoin(campaign, eq(performanceDaily.campaignId, campaign.campaignId))
                            .where(and(...conditions))
                            .groupBy(performanceDaily.campaignId, campaign.name, campaign.state, campaign.adProduct, campaign.startDate, campaign.endDate)
                            .orderBy(orderDirection, performanceDaily.campaignId)
                            .limit(pagination.limit + 1)
                            .offset(pagination.offset);

                        return formatResponse(rows, pagination.offset, pagination.limit, input.dimension);
                    }

                    case 'adGroup': {
                        const searchCondition = buildAdGroupSearchCondition(input.filters?.search ?? null);
                        const conditions = [...whereConditions, ...(searchCondition ? [searchCondition] : [])];

                        const rows = await db
                            .select({
                                adGroupId: performanceDaily.adGroupId,
                                campaignId: performanceDaily.campaignId,
                                campaignName: campaign.name,
                                name: adGroup.name,
                                state: adGroup.state,
                                adProduct: adGroup.adProduct,
                                impressions: metricsExpressions.impressions.as('impressions'),
                                clicks: metricsExpressions.clicks.as('clicks'),
                                orders: metricsExpressions.orders.as('orders'),
                                spend: metricsExpressions.spend.as('spend'),
                                sales: metricsExpressions.sales.as('sales'),
                            })
                            .from(performanceDaily)
                            .leftJoin(adGroup, eq(performanceDaily.adGroupId, adGroup.adGroupId))
                            .leftJoin(campaign, eq(performanceDaily.campaignId, campaign.campaignId))
                            .where(and(...conditions))
                            .groupBy(performanceDaily.adGroupId, performanceDaily.campaignId, campaign.name, adGroup.name, adGroup.state, adGroup.adProduct)
                            .orderBy(orderDirection, performanceDaily.adGroupId)
                            .limit(pagination.limit + 1)
                            .offset(pagination.offset);

                        return formatResponse(rows, pagination.offset, pagination.limit, input.dimension);
                    }

                    case 'ad': {
                        const searchCondition = buildAdSearchCondition(input.filters?.search ?? null);
                        const conditions = [...whereConditions, ...(searchCondition ? [searchCondition] : [])];

                        const rows = await db
                            .select({
                                adId: performanceDaily.adId,
                                campaignId: performanceDaily.campaignId,
                                campaignName: campaign.name,
                                adGroupId: performanceDaily.adGroupId,
                                adGroupName: adGroup.name,
                                adProduct: ad.adProduct,
                                adType: ad.adType,
                                state: ad.state,
                                productAsin: ad.productAsin,
                                impressions: metricsExpressions.impressions.as('impressions'),
                                clicks: metricsExpressions.clicks.as('clicks'),
                                orders: metricsExpressions.orders.as('orders'),
                                spend: metricsExpressions.spend.as('spend'),
                                sales: metricsExpressions.sales.as('sales'),
                            })
                            .from(performanceDaily)
                            .leftJoin(ad, eq(performanceDaily.adId, ad.adId))
                            .leftJoin(adGroup, eq(performanceDaily.adGroupId, adGroup.adGroupId))
                            .leftJoin(campaign, eq(performanceDaily.campaignId, campaign.campaignId))
                            .where(and(...conditions))
                            .groupBy(performanceDaily.adId, performanceDaily.campaignId, performanceDaily.adGroupId, campaign.name, adGroup.name, ad.adProduct, ad.adType, ad.state, ad.productAsin)
                            .orderBy(orderDirection, performanceDaily.adId)
                            .limit(pagination.limit + 1)
                            .offset(pagination.offset);

                        return formatResponse(rows, pagination.offset, pagination.limit, input.dimension);
                    }

                    case 'target': {
                        const searchCondition = buildTargetSearchCondition(input.filters?.search ?? null);
                        const conditions = [...whereConditions, ...(searchCondition ? [searchCondition] : [])];

                        const rows = await db
                            .select({
                                targetId: performanceDaily.entityId,
                                campaignId: performanceDaily.campaignId,
                                campaignName: campaign.name,
                                adGroupId: performanceDaily.adGroupId,
                                adGroupName: adGroup.name,
                                state: target.state,
                                negative: target.negative,
                                targetType: target.targetType,
                                targetMatchType: target.targetMatchType,
                                targetKeyword: target.targetKeyword,
                                targetAsin: target.targetAsin,
                                impressions: metricsExpressions.impressions.as('impressions'),
                                clicks: metricsExpressions.clicks.as('clicks'),
                                orders: metricsExpressions.orders.as('orders'),
                                spend: metricsExpressions.spend.as('spend'),
                                sales: metricsExpressions.sales.as('sales'),
                            })
                            .from(performanceDaily)
                            .leftJoin(target, eq(performanceDaily.entityId, target.targetId))
                            .leftJoin(adGroup, eq(performanceDaily.adGroupId, adGroup.adGroupId))
                            .leftJoin(campaign, eq(performanceDaily.campaignId, campaign.campaignId))
                            .where(and(...conditions, eq(performanceDaily.entityType, 'target')))
                            .groupBy(
                                performanceDaily.entityId,
                                performanceDaily.campaignId,
                                performanceDaily.adGroupId,
                                campaign.name,
                                adGroup.name,
                                target.state,
                                target.negative,
                                target.targetType,
                                target.targetMatchType,
                                target.targetKeyword,
                                target.targetAsin
                            )
                            .orderBy(orderDirection, performanceDaily.entityId)
                            .limit(pagination.limit + 1)
                            .offset(pagination.offset);

                        return formatResponse(rows, pagination.offset, pagination.limit, input.dimension);
                    }

                    default:
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Unsupported dimension: ${input.dimension}`,
                        });
                }
            }),
    });

const parseDateRange = (startDate: string, endDate: string) => {
    const start = parseDateString(startDate);
    const end = parseDateString(endDate);

    if (!(start && end)) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Dates must match MM-DD-YYYY.',
        });
    }

    return {
        startDateSql: start,
        endDateSql: end,
    };
};

const parseDateString = (value: string) => {
    const [month, day, year] = value.split('-');
    if (!(month && day && year)) {
        return null;
    }

    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const yearNumber = Number(year);

    if (!(Number.isInteger(monthNumber) && Number.isInteger(dayNumber) && Number.isInteger(yearNumber))) {
        return null;
    }
    if (monthNumber < 1 || monthNumber > 12) {
        return null;
    }
    if (dayNumber < 1 || dayNumber > 31) {
        return null;
    }

    const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const date = new Date(yearNumber, monthNumber - 1, dayNumber);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    if (date.getFullYear() !== yearNumber || date.getMonth() !== monthNumber - 1 || date.getDate() !== dayNumber) {
        return null;
    }

    return normalized;
};

const getPagination = (limit?: number, cursor?: string) => {
    const resolvedLimit = limit ?? 50;
    const offset = cursor ? Number(cursor) : 0;

    if (!Number.isFinite(offset) || offset < 0) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'cursor must be a non-negative number string.',
        });
    }

    return { limit: resolvedLimit, offset };
};

const buildMetricExpressions = () => {
    return {
        impressions: sql<number>`sum(${performanceDaily.impressions})`,
        clicks: sql<number>`sum(${performanceDaily.clicks})`,
        orders: sql<number>`sum(${performanceDaily.orders})`,
        spend: sql<number>`sum(${performanceDaily.spend})`,
        sales: sql<number>`sum(${performanceDaily.sales})`,
    };
};

const buildSortExpression = (sortField: 'impressions' | 'clicks' | 'orders' | 'spend' | 'sales' | 'ctr' | 'cpc' | 'roas' | 'acos', metrics: ReturnType<typeof buildMetricExpressions>) => {
    switch (sortField) {
        case 'impressions':
            return metrics.impressions;
        case 'clicks':
            return metrics.clicks;
        case 'orders':
            return metrics.orders;
        case 'sales':
            return metrics.sales;
        case 'ctr':
            return sql<number>`coalesce(${metrics.clicks}::float / nullif(${metrics.impressions}::float, 0), 0)`;
        case 'cpc':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.clicks}::float, 0), 0)`;
        case 'roas':
            return sql<number>`coalesce(${metrics.sales}::float / nullif(${metrics.spend}::float, 0), 0)`;
        case 'acos':
            return sql<number>`coalesce(${metrics.spend}::float / nullif(${metrics.sales}::float, 0), 0)`;
        default:
            return metrics.spend;
    }
};

const buildPerformanceFilters = (
    dimension: 'campaign' | 'adGroup' | 'ad' | 'target',
    filters:
        | {
              search?: string;
              state?: string;
              adProduct?: string;
              campaignId?: string;
              adGroupId?: string;
              negative?: boolean;
              targetType?: string;
              targetMatchType?: string;
          }
        | null
        | undefined
) => {
    if (!filters) {
        return [];
    }

    const conditions: SQL<unknown>[] = [];

    if (filters.campaignId) {
        conditions.push(eq(performanceDaily.campaignId, filters.campaignId));
    }

    if (filters.adGroupId) {
        conditions.push(eq(performanceDaily.adGroupId, filters.adGroupId));
    }

    if (filters.state) {
        const stateColumn = getStateColumn(dimension);
        conditions.push(eq(stateColumn, filters.state));
    }

    if (filters.adProduct) {
        const adProductColumn = getAdProductColumn(dimension);
        conditions.push(eq(adProductColumn, filters.adProduct));
    }

    if (dimension === 'target' && typeof filters.negative === 'boolean') {
        conditions.push(eq(target.negative, filters.negative));
    }

    if (dimension === 'target' && filters.targetType) {
        conditions.push(eq(target.targetType, filters.targetType));
    }

    if (dimension === 'target' && filters.targetMatchType) {
        conditions.push(eq(target.targetMatchType, filters.targetMatchType));
    }

    return conditions;
};

const getStateColumn = (dimension: 'campaign' | 'adGroup' | 'ad' | 'target') => {
    switch (dimension) {
        case 'campaign':
            return campaign.state;
        case 'adGroup':
            return adGroup.state;
        case 'ad':
            return ad.state;
        case 'target':
            return target.state;
        default:
            throw new Error(`Unsupported dimension: ${dimension}`);
    }
};

const getAdProductColumn = (dimension: 'campaign' | 'adGroup' | 'ad' | 'target') => {
    switch (dimension) {
        case 'campaign':
            return campaign.adProduct;
        case 'adGroup':
            return adGroup.adProduct;
        case 'ad':
            return ad.adProduct;
        case 'target':
            return target.adProduct;
        default:
            throw new Error(`Unsupported dimension: ${dimension}`);
    }
};

const buildCampaignSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) {
        return null;
    }
    const query = `%${trimmed}%`;
    return or(ilike(campaign.name, query), ilike(performanceDaily.campaignId, query));
};

const buildAdGroupSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) {
        return null;
    }
    const query = `%${trimmed}%`;
    return or(ilike(adGroup.name, query), ilike(performanceDaily.adGroupId, query));
};

const buildAdSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) {
        return null;
    }
    const query = `%${trimmed}%`;
    return or(ilike(performanceDaily.adId, query), ilike(ad.productAsin, query));
};

const buildTargetSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) {
        return null;
    }
    const query = `%${trimmed}%`;
    return or(ilike(target.targetKeyword, query), ilike(target.targetAsin, query), ilike(performanceDaily.entityId, query));
};

const formatResponse = (rows: Record<string, unknown>[], offset: number, limit: number, dimension: 'campaign' | 'adGroup' | 'ad' | 'target') => {
    const sliced = rows.length > limit ? rows.slice(0, limit) : rows;
    const hasMore = rows.length > limit;

    const formattedRows = sliced.map(row => {
        const impressions = Number(row.impressions ?? 0);
        const clicks = Number(row.clicks ?? 0);
        const orders = Number(row.orders ?? 0);
        const spend = Number(row.spend ?? 0);
        const sales = Number(row.sales ?? 0);

        const metrics = {
            impressions,
            clicks,
            orders,
            spend,
            sales,
            ctr: impressions === 0 ? 0 : clicks / impressions,
            cpc: clicks === 0 ? 0 : spend / clicks,
            roas: spend === 0 ? 0 : sales / spend,
            acos: sales === 0 ? 0 : spend / sales,
        };

        if (dimension === 'campaign') {
            return {
                dimension,
                campaignId: String(row.campaignId),
                name: String(row.name ?? row.campaignId ?? ''),
                state: String(row.state ?? ''),
                adProduct: String(row.adProduct ?? ''),
                startDate: String(row.startDate ?? ''),
                endDate: row.endDate ? String(row.endDate) : null,
                metrics,
            };
        }

        if (dimension === 'adGroup') {
            return {
                dimension,
                adGroupId: String(row.adGroupId),
                campaignId: String(row.campaignId),
                campaignName: row.campaignName ? String(row.campaignName) : null,
                name: String(row.name ?? row.adGroupId ?? ''),
                state: String(row.state ?? ''),
                adProduct: String(row.adProduct ?? ''),
                metrics,
            };
        }

        if (dimension === 'ad') {
            return {
                dimension,
                adId: String(row.adId),
                campaignId: String(row.campaignId),
                campaignName: row.campaignName ? String(row.campaignName) : null,
                adGroupId: String(row.adGroupId),
                adGroupName: row.adGroupName ? String(row.adGroupName) : null,
                adProduct: String(row.adProduct ?? ''),
                adType: String(row.adType ?? ''),
                state: String(row.state ?? ''),
                productAsin: row.productAsin ? String(row.productAsin) : null,
                metrics,
            };
        }

        return {
            dimension,
            targetId: String(row.targetId),
            campaignId: String(row.campaignId),
            campaignName: row.campaignName ? String(row.campaignName) : null,
            adGroupId: row.adGroupId ? String(row.adGroupId) : null,
            adGroupName: row.adGroupName ? String(row.adGroupName) : null,
            state: String(row.state ?? ''),
            negative: Boolean(row.negative),
            targetType: String(row.targetType ?? ''),
            targetMatchType: row.targetMatchType ? String(row.targetMatchType) : null,
            targetKeyword: row.targetKeyword ? String(row.targetKeyword) : null,
            targetAsin: row.targetAsin ? String(row.targetAsin) : null,
            targetDisplay: buildTargetDisplay({
                targetId: String(row.targetId),
                targetType: row.targetType ? String(row.targetType) : null,
                targetMatchType: row.targetMatchType ? String(row.targetMatchType) : null,
                targetKeyword: row.targetKeyword ? String(row.targetKeyword) : null,
                targetAsin: row.targetAsin ? String(row.targetAsin) : null,
            }),
            metrics,
        };
    });

    return {
        rows: formattedRows,
        nextCursor: hasMore ? String(offset + limit) : null,
    };
};

const buildTargetDisplay = ({
    targetId,
    targetType,
    targetMatchType,
    targetKeyword,
    targetAsin,
}: {
    targetId: string;
    targetType: string | null;
    targetMatchType: string | null;
    targetKeyword: string | null;
    targetAsin: string | null;
}) => {
    if (targetKeyword && targetMatchType) {
        return `Keyword · ${targetMatchType} · ${targetKeyword}`;
    }

    if (targetAsin) {
        const matchLabel = targetMatchType ? ` · ${targetMatchType}` : '';
        return `Product · ${targetAsin}${matchLabel}`;
    }

    if (targetType === 'AUTO' && targetMatchType) {
        return `Auto · ${targetMatchType}`;
    }

    return `Target · ${targetId}`;
};
