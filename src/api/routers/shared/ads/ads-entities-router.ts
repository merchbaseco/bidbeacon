import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/db/index';
import { ad, campaign } from '@/db/schema';
import { adDetailInputSchema, adDetailOutputSchema, adListInputSchema, adListOutputSchema } from '@/types/ads-api';
import type { apiProcedure } from '@/api/trpc';
import { router } from '@/api/trpc';
import { formatDateTime, formatListResponse, getPagination } from '../../ads/shared';

export const buildAdsEntitiesRouter = (procedure: typeof apiProcedure) =>
    router({
        list: procedure
            .input(adListInputSchema)
            .output(adListOutputSchema)
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
                    conditions.push(eq(ad.campaignId, input.filters.campaignId));
                }

                if (input.filters?.adGroupId) {
                    conditions.push(eq(ad.adGroupId, input.filters.adGroupId));
                }

                if (input.filters?.state) {
                    conditions.push(eq(ad.state, input.filters.state));
                }

                if (input.filters?.adProduct) {
                    conditions.push(eq(ad.adProduct, input.filters.adProduct));
                }

                if (input.filters?.productAsin) {
                    conditions.push(eq(ad.productAsin, input.filters.productAsin));
                }

                const searchCondition = buildAdSearchCondition(input.filters?.search ?? null);
                if (searchCondition) {
                    conditions.push(searchCondition);
                }

                const orderExpression = getAdSortExpression(sortField);
                const orderDirection = sortDirection === 'asc' ? asc(orderExpression) : desc(orderExpression);

                const rows = await db
                    .select({
                        adId: ad.adId,
                        campaignId: ad.campaignId,
                        adGroupId: ad.adGroupId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        adProduct: ad.adProduct,
                        adType: ad.adType,
                        state: ad.state,
                        deliveryStatus: ad.deliveryStatus,
                        productAsin: ad.productAsin,
                        creationDateTime: ad.creationDateTime,
                        lastUpdatedDateTime: ad.lastUpdatedDateTime,
                    })
                    .from(ad)
                    .innerJoin(campaign, eq(ad.campaignId, campaign.campaignId))
                    .where(and(...conditions))
                    .orderBy(orderDirection, ad.adId)
                    .limit(pagination.limit + 1)
                    .offset(pagination.offset);

                return formatListResponse(rows, pagination.offset, pagination.limit, formatAdRow);
            }),
        get: procedure
            .input(adDetailInputSchema)
            .output(adDetailOutputSchema)
            .query(async ({ ctx, input }) => {
                ctx.assertAccountAccess(input.accountId);

                const [row] = await db
                    .select({
                        adId: ad.adId,
                        campaignId: ad.campaignId,
                        adGroupId: ad.adGroupId,
                        accountId: campaign.accountId,
                        countryCode: campaign.countryCode,
                        adProduct: ad.adProduct,
                        adType: ad.adType,
                        state: ad.state,
                        deliveryStatus: ad.deliveryStatus,
                        productAsin: ad.productAsin,
                        creationDateTime: ad.creationDateTime,
                        lastUpdatedDateTime: ad.lastUpdatedDateTime,
                    })
                    .from(ad)
                    .innerJoin(campaign, eq(ad.campaignId, campaign.campaignId))
                    .where(and(eq(ad.adId, input.adId), eq(campaign.accountId, input.accountId)))
                    .limit(1);

                if (!row) {
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: 'Ad not found for this account.',
                    });
                }

                return formatAdRow(row);
            }),
    });

const buildAdSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) return null;
    const query = `%${trimmed}%`;
    return or(ilike(ad.adId, query), ilike(ad.productAsin, query));
};

const getAdSortExpression = (field: 'lastUpdatedDateTime' | 'adId' | 'state') => {
    switch (field) {
        case 'adId':
            return ad.adId;
        case 'state':
            return ad.state;
        case 'lastUpdatedDateTime':
        default:
            return ad.lastUpdatedDateTime;
    }
};

const formatAdRow = (row: {
    adId: string | null;
    campaignId: string | null;
    adGroupId: string | null;
    accountId: string | null;
    countryCode: string | null;
    adProduct: string | null;
    adType: string | null;
    state: string | null;
    deliveryStatus: string | null;
    productAsin: string | null;
    creationDateTime: Date | string | null;
    lastUpdatedDateTime: Date | string | null;
}) => ({
    adId: String(row.adId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    adGroupId: String(row.adGroupId ?? ''),
    accountId: String(row.accountId ?? ''),
    countryCode: row.countryCode ?? null,
    adProduct: String(row.adProduct ?? ''),
    adType: String(row.adType ?? ''),
    state: String(row.state ?? ''),
    deliveryStatus: String(row.deliveryStatus ?? ''),
    productAsin: row.productAsin ? String(row.productAsin) : null,
    creationDateTime: formatDateTime(row.creationDateTime),
    lastUpdatedDateTime: formatDateTime(row.lastUpdatedDateTime),
});
