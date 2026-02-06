import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { campaign } from '@/db/schema';
import {
    campaignDetailInputSchema,
    campaignDetailOutputSchema,
    campaignListInputSchema,
    campaignListOutputSchema,
} from '@/types/ads-api';
import type { apiProcedure } from '@/api/trpc';
import { router } from '@/api/trpc';
import { formatDate, formatDateTime, formatListResponse, getPagination, parseNumeric } from '../../ads/shared';

export const buildCampaignsRouter = (procedure: typeof apiProcedure) =>
    router({
        list: procedure
            .input(campaignListInputSchema)
            .output(campaignListOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const pagination = getPagination(input.pagination?.limit, input.pagination?.cursor);
                const sortField = input.sort?.field ?? 'lastUpdatedDateTime';
                const sortDirection = input.sort?.direction ?? 'desc';

                const conditions = [eq(campaign.accountId, input.accountId)];

                if (input.countryCode) {
                    conditions.push(eq(campaign.countryCode, input.countryCode));
                }

                if (input.filters?.state) {
                    conditions.push(eq(campaign.state, input.filters.state));
                }

                if (input.filters?.adProduct) {
                    conditions.push(eq(campaign.adProduct, input.filters.adProduct));
                }

                const searchCondition = buildCampaignSearchCondition(input.filters?.search ?? null);
                if (searchCondition) {
                    conditions.push(searchCondition);
                }

                const orderExpression = getCampaignSortExpression(sortField);
                const orderDirection = sortDirection === 'asc' ? asc(orderExpression) : desc(orderExpression);

                const rows = await db
                    .select({
                        campaignId: campaign.campaignId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        name: campaign.name,
                        adProduct: campaign.adProduct,
                        state: campaign.state,
                        deliveryStatus: campaign.deliveryStatus,
                        targetingSettings: campaign.targetingSettings,
                        bidStrategy: campaign.bidStrategy,
                        budgetType: campaign.budgetType,
                        budgetPeriod: campaign.budgetPeriod,
                        budgetAmount: campaign.budgetAmount,
                        startDate: campaign.startDate,
                        endDate: campaign.endDate,
                        creationDateTime: campaign.creationDateTime,
                        lastUpdatedDateTime: campaign.lastUpdatedDateTime,
                    })
                    .from(campaign)
                    .where(and(...conditions))
                    .orderBy(orderDirection, campaign.campaignId)
                    .limit(pagination.limit + 1)
                    .offset(pagination.offset);

                return formatListResponse(rows, pagination.offset, pagination.limit, formatCampaignRow);
            }),
        get: procedure
            .input(campaignDetailInputSchema)
            .output(campaignDetailOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const [row] = await db
                    .select({
                        campaignId: campaign.campaignId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        name: campaign.name,
                        adProduct: campaign.adProduct,
                        state: campaign.state,
                        deliveryStatus: campaign.deliveryStatus,
                        targetingSettings: campaign.targetingSettings,
                        bidStrategy: campaign.bidStrategy,
                        budgetType: campaign.budgetType,
                        budgetPeriod: campaign.budgetPeriod,
                        budgetAmount: campaign.budgetAmount,
                        startDate: campaign.startDate,
                        endDate: campaign.endDate,
                        creationDateTime: campaign.creationDateTime,
                        lastUpdatedDateTime: campaign.lastUpdatedDateTime,
                    })
                    .from(campaign)
                    .where(and(eq(campaign.accountId, input.accountId), eq(campaign.campaignId, input.campaignId)))
                    .limit(1);

                if (!row) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Campaign not found for this account.',
                    });
                }

                return formatCampaignRow(row);
            }),
    });

const buildCampaignSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) return null;
    const query = `%${trimmed}%`;
    return or(ilike(campaign.name, query), ilike(campaign.campaignId, query));
};

const getCampaignSortExpression = (field: 'lastUpdatedDateTime' | 'name' | 'startDate' | 'budgetAmount' | 'state') => {
    switch (field) {
        case 'name':
            return campaign.name;
        case 'startDate':
            return campaign.startDate;
        case 'budgetAmount':
            return campaign.budgetAmount;
        case 'state':
            return campaign.state;
        case 'lastUpdatedDateTime':
        default:
            return campaign.lastUpdatedDateTime;
    }
};

const formatCampaignRow = (row: {
    campaignId: string | null;
    accountId: string | null;
    countryCode: string | null;
    name: string | null;
    adProduct: string | null;
    state: string | null;
    deliveryStatus: string | null;
    targetingSettings: string | null;
    bidStrategy: string | null;
    budgetType: string | null;
    budgetPeriod: string | null;
    budgetAmount: string | number | null;
    startDate: string | Date | null;
    endDate: string | Date | null;
    creationDateTime: Date | string | null;
    lastUpdatedDateTime: Date | string | null;
}) => ({
    campaignId: String(row.campaignId ?? ''),
    accountId: String(row.accountId ?? ''),
    countryCode: row.countryCode ?? null,
    name: String(row.name ?? ''),
    adProduct: String(row.adProduct ?? ''),
    state: String(row.state ?? ''),
    deliveryStatus: String(row.deliveryStatus ?? ''),
    targetingSettings: String(row.targetingSettings ?? ''),
    bidStrategy: row.bidStrategy ? String(row.bidStrategy) : null,
    budgetType: row.budgetType ? String(row.budgetType) : null,
    budgetPeriod: row.budgetPeriod ? String(row.budgetPeriod) : null,
    budgetAmount: parseNumeric(row.budgetAmount),
    startDate: formatDate(row.startDate),
    endDate: row.endDate ? formatDate(row.endDate) : null,
    creationDateTime: formatDateTime(row.creationDateTime),
    lastUpdatedDateTime: formatDateTime(row.lastUpdatedDateTime),
});
