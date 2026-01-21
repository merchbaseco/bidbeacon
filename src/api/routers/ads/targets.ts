import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { updateTargetBid } from '@/amazon-ads/update-target-bid';
import { db } from '@/db/index';
import { campaign, target } from '@/db/schema';
import {
    targetDetailInputSchema,
    targetDetailOutputSchema,
    targetListInputSchema,
    targetListOutputSchema,
    updateTargetBidInputSchema,
    updateTargetBidOutputSchema,
} from '@/types/ads-api';
import { protectedProcedure, router } from '../../trpc';
import { formatDateTime, formatListResponse, getPagination, isSponsoredProducts, parseNumeric, resolveProfileId, toMoneyString } from './shared';

export const targetsRouter = router({
    list: protectedProcedure
        .input(targetListInputSchema)
        .output(targetListOutputSchema)
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
                conditions.push(eq(target.campaignId, input.filters.campaignId));
            }

            if (input.filters?.adGroupId) {
                conditions.push(eq(target.adGroupId, input.filters.adGroupId));
            }

            if (input.filters?.state) {
                conditions.push(eq(target.state, input.filters.state));
            }

            if (input.filters?.adProduct) {
                conditions.push(eq(target.adProduct, input.filters.adProduct));
            }

            if (typeof input.filters?.negative === 'boolean') {
                conditions.push(eq(target.negative, input.filters.negative));
            }

            if (input.filters?.targetType) {
                conditions.push(eq(target.targetType, input.filters.targetType));
            }

            if (input.filters?.targetMatchType) {
                conditions.push(eq(target.targetMatchType, input.filters.targetMatchType));
            }

            const searchCondition = buildTargetSearchCondition(input.filters?.search ?? null);
            if (searchCondition) {
                conditions.push(searchCondition);
            }

            const orderExpression = getTargetSortExpression(sortField);
            const orderDirection = sortDirection === 'asc' ? asc(orderExpression) : desc(orderExpression);

            const rows = await db
                .select({
                    targetId: target.targetId,
                    campaignId: target.campaignId,
                    adGroupId: target.adGroupId,
                    accountId: campaign.accountId,
                    countryCode: campaign.countryCode,
                    adProduct: target.adProduct,
                    state: target.state,
                    deliveryStatus: target.deliveryStatus,
                    negative: target.negative,
                    bidAmount: target.bidAmount,
                    targetType: target.targetType,
                    targetMatchType: target.targetMatchType,
                    targetKeyword: target.targetKeyword,
                    targetAsin: target.targetAsin,
                    creationDateTime: target.creationDateTime,
                    lastUpdatedDateTime: target.lastUpdatedDateTime,
                })
                .from(target)
                .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
                .where(and(...conditions))
                .orderBy(orderDirection, target.targetId)
                .limit(pagination.limit + 1)
                .offset(pagination.offset);

            return formatListResponse(rows, pagination.offset, pagination.limit, formatTargetRow);
        }),
    get: protectedProcedure
        .input(targetDetailInputSchema)
        .output(targetDetailOutputSchema)
        .query(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            const [row] = await db
                .select({
                    targetId: target.targetId,
                    campaignId: target.campaignId,
                    adGroupId: target.adGroupId,
                    accountId: campaign.accountId,
                    countryCode: campaign.countryCode,
                    adProduct: target.adProduct,
                    state: target.state,
                    deliveryStatus: target.deliveryStatus,
                    negative: target.negative,
                    bidAmount: target.bidAmount,
                    targetType: target.targetType,
                    targetMatchType: target.targetMatchType,
                    targetKeyword: target.targetKeyword,
                    targetAsin: target.targetAsin,
                    creationDateTime: target.creationDateTime,
                    lastUpdatedDateTime: target.lastUpdatedDateTime,
                })
                .from(target)
                .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
                .where(and(eq(target.targetId, input.targetId), eq(campaign.accountId, input.accountId)))
                .limit(1);

            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Target not found for this account.',
                });
            }

            return formatTargetRow(row);
        }),
    updateBid: protectedProcedure
        .input(updateTargetBidInputSchema)
        .output(updateTargetBidOutputSchema)
        .mutation(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            const [row] = await db
                .select({
                    targetId: target.targetId,
                    adGroupId: target.adGroupId,
                    accountId: campaign.accountId,
                    countryCode: campaign.countryCode,
                    adProduct: target.adProduct,
                    negative: target.negative,
                })
                .from(target)
                .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
                .where(and(eq(target.targetId, input.targetId), eq(campaign.accountId, input.accountId)))
                .limit(1);

            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Target not found for this account.',
                });
            }

            if (row.negative) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Negative targets do not support bid updates.',
                });
            }

            if (!row.adGroupId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Campaign-level targets do not support bid updates.',
                });
            }

            if (!isSponsoredProducts(row.adProduct)) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Bid updates are only supported for Sponsored Products targets.',
                });
            }

            const profileId = await resolveProfileId(row.accountId, row.countryCode);

            await updateTargetBid({
                profileId,
                targetId: row.targetId,
                bid: input.bidAmount,
            });

            const updatedAt = new Date();
            await db
                .update(target)
                .set({
                    bidAmount: toMoneyString(input.bidAmount),
                    lastUpdatedDateTime: updatedAt,
                })
                .where(eq(target.targetId, row.targetId));

            return {
                targetId: row.targetId,
                bidAmount: input.bidAmount,
                lastUpdatedDateTime: updatedAt.toISOString(),
            };
        }),
});

const buildTargetSearchCondition = (search: string | null) => {
    const trimmed = search?.trim();
    if (!trimmed) return null;
    const query = `%${trimmed}%`;
    return or(ilike(target.targetKeyword, query), ilike(target.targetAsin, query), ilike(target.targetId, query));
};

const getTargetSortExpression = (field: 'lastUpdatedDateTime' | 'bidAmount' | 'state' | 'targetType') => {
    switch (field) {
        case 'bidAmount':
            return target.bidAmount;
        case 'state':
            return target.state;
        case 'targetType':
            return target.targetType;
        case 'lastUpdatedDateTime':
        default:
            return target.lastUpdatedDateTime;
    }
};

const formatTargetRow = (row: {
    targetId: string | null;
    campaignId: string | null;
    adGroupId: string | null;
    accountId: string | null;
    countryCode: string | null;
    adProduct: string | null;
    state: string | null;
    deliveryStatus: string | null;
    negative: boolean | null;
    bidAmount: string | number | null;
    targetType: string | null;
    targetMatchType: string | null;
    targetKeyword: string | null;
    targetAsin: string | null;
    creationDateTime: Date | string | null;
    lastUpdatedDateTime: Date | string | null;
}) => ({
    targetId: String(row.targetId ?? ''),
    campaignId: String(row.campaignId ?? ''),
    adGroupId: row.adGroupId ? String(row.adGroupId) : null,
    accountId: String(row.accountId ?? ''),
    countryCode: row.countryCode ?? null,
    adProduct: String(row.adProduct ?? ''),
    state: String(row.state ?? ''),
    deliveryStatus: String(row.deliveryStatus ?? ''),
    negative: Boolean(row.negative),
    bidAmount: parseNumeric(row.bidAmount),
    targetType: String(row.targetType ?? ''),
    targetMatchType: row.targetMatchType ? String(row.targetMatchType) : null,
    targetKeyword: row.targetKeyword ? String(row.targetKeyword) : null,
    targetAsin: row.targetAsin ? String(row.targetAsin) : null,
    targetDisplay: buildTargetDisplay({
        targetId: String(row.targetId ?? ''),
        targetType: row.targetType ? String(row.targetType) : null,
        targetMatchType: row.targetMatchType ? String(row.targetMatchType) : null,
        targetKeyword: row.targetKeyword ? String(row.targetKeyword) : null,
        targetAsin: row.targetAsin ? String(row.targetAsin) : null,
    }),
    creationDateTime: formatDateTime(row.creationDateTime),
    lastUpdatedDateTime: formatDateTime(row.lastUpdatedDateTime),
});

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
