import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { updateAdGroupBid } from '@/amazon-ads/update-ad-group-bid';
import type { apiProcedure } from '@/api/trpc';
import { router } from '@/api/trpc';
import { db } from '@/db/index';
import { adGroup, campaign } from '@/db/schema';
import { adGroupDetailInputSchema, adGroupDetailOutputSchema, adGroupListInputSchema, adGroupListOutputSchema, updateAdGroupBidInputSchema, updateAdGroupBidOutputSchema } from '@/types/ads-api';
import { formatDateTime, formatListResponse, getPagination, isSponsoredProducts, parseNumeric, resolveProfileId, toMoneyString } from './shared';

export const buildAdGroupsRouter = (procedure: typeof apiProcedure) =>
    router({
        list: procedure
            .input(adGroupListInputSchema)
            .output(adGroupListOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const pagination = getPagination(input.pagination?.limit, input.pagination?.cursor);
                const sortField = input.sort?.field ?? 'lastUpdatedDateTime';
                const sortDirection = input.sort?.direction ?? 'desc';

                const conditions = [eq(campaign.accountId, input.accountId)];

                if (input.countryCode) {
                    conditions.push(eq(campaign.countryCode, input.countryCode));
                }

                if (input.filters?.campaignId) {
                    conditions.push(eq(adGroup.campaignId, input.filters.campaignId));
                }

                if (input.filters?.state) {
                    conditions.push(eq(adGroup.state, input.filters.state));
                }

                if (input.filters?.adProduct) {
                    conditions.push(eq(adGroup.adProduct, input.filters.adProduct));
                }

                const searchCondition = buildAdGroupSearchCondition(input.filters?.search ?? null);
                if (searchCondition) {
                    conditions.push(searchCondition);
                }

                const orderExpression = getAdGroupSortExpression(sortField);
                const orderDirection = sortDirection === 'asc' ? asc(orderExpression) : desc(orderExpression);

                const rows = await db
                    .select({
                        adGroupId: adGroup.adGroupId,
                        campaignId: adGroup.campaignId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        name: adGroup.name,
                        adProduct: adGroup.adProduct,
                        state: adGroup.state,
                        deliveryStatus: adGroup.deliveryStatus,
                        bidAmount: adGroup.bidAmount,
                        creationDateTime: adGroup.creationDateTime,
                        lastUpdatedDateTime: adGroup.lastUpdatedDateTime,
                    })
                    .from(adGroup)
                    .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
                    .where(and(...conditions))
                    .orderBy(orderDirection, adGroup.adGroupId)
                    .limit(pagination.limit + 1)
                    .offset(pagination.offset);

                return formatListResponse(rows, pagination.offset, pagination.limit, formatAdGroupRow);
            }),
        get: procedure
            .input(adGroupDetailInputSchema)
            .output(adGroupDetailOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const [row] = await db
                    .select({
                        adGroupId: adGroup.adGroupId,
                        campaignId: adGroup.campaignId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        name: adGroup.name,
                        adProduct: adGroup.adProduct,
                        state: adGroup.state,
                        deliveryStatus: adGroup.deliveryStatus,
                        bidAmount: adGroup.bidAmount,
                        creationDateTime: adGroup.creationDateTime,
                        lastUpdatedDateTime: adGroup.lastUpdatedDateTime,
                    })
                    .from(adGroup)
                    .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
                    .where(and(eq(adGroup.adGroupId, input.adGroupId), eq(campaign.accountId, input.accountId)))
                    .limit(1);

                if (!row) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Ad group not found for this account.',
                    });
                }

                return formatAdGroupRow(row);
            }),
        updateBid: procedure
            .input(updateAdGroupBidInputSchema)
            .output(updateAdGroupBidOutputSchema)
            .mutation(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const [row] = await db
                    .select({
                        adGroupId: adGroup.adGroupId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        adProduct: adGroup.adProduct,
                    })
                    .from(adGroup)
                    .innerJoin(campaign, eq(adGroup.campaignId, campaign.campaignId))
                    .where(and(eq(adGroup.adGroupId, input.adGroupId), eq(campaign.accountId, input.accountId)))
                    .limit(1);

                if (!row) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Ad group not found for this account.',
                    });
                }

                if (!isSponsoredProducts(row.adProduct)) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Bid updates are only supported for Sponsored Products ad groups.',
                    });
                }

                const profileId = await resolveProfileId(row.accountId, row.countryCode);

                await updateAdGroupBid({
                    profileId,
                    adGroupId: row.adGroupId,
                    bid: input.bidAmount,
                });

                const updatedAt = new Date();
                await db
                    .update(adGroup)
                    .set({
                        bidAmount: toMoneyString(input.bidAmount),
                        lastUpdatedDateTime: updatedAt,
                    })
                    .where(eq(adGroup.adGroupId, row.adGroupId));

                return {
                    adGroupId: row.adGroupId,
                    bidAmount: input.bidAmount,
                    lastUpdatedDateTime: updatedAt.toISOString(),
                };
            }),
    });

const buildAdGroupSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) {
        return null;
    }
    const query = `%${trimmed}%`;
    return or(ilike(adGroup.name, query), ilike(adGroup.adGroupId, query));
};

const getAdGroupSortExpression = (field: 'lastUpdatedDateTime' | 'name' | 'bidAmount' | 'state') => {
    switch (field) {
        case 'name':
            return adGroup.name;
        case 'bidAmount':
            return adGroup.bidAmount;
        case 'state':
            return adGroup.state;
        default:
            return adGroup.lastUpdatedDateTime;
    }
};

const formatAdGroupRow = (row: {
    adGroupId: string | null;
    campaignId: string | null;
    accountId: string | null;
    countryCode: string | null;
    name: string | null;
    adProduct: string | null;
    state: string | null;
    deliveryStatus: string | null;
    bidAmount: string | number | null;
    creationDateTime: Date | string | null;
    lastUpdatedDateTime: Date | string | null;
}) => ({
    adGroupId: String(row.adGroupId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    accountId: String(row.accountId ?? ''),
    countryCode: row.countryCode ?? null,
    name: String(row.name ?? ''),
    adProduct: String(row.adProduct ?? ''),
    state: String(row.state ?? ''),
    deliveryStatus: String(row.deliveryStatus ?? ''),
    bidAmount: parseNumeric(row.bidAmount),
    creationDateTime: formatDateTime(row.creationDateTime),
    lastUpdatedDateTime: formatDateTime(row.lastUpdatedDateTime),
});
