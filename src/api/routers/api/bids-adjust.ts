import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { extractMultiStatusEntity, updateTargets } from '@/amazon-ads/sp-entities';
import { parseNumeric } from '@/api/routers/ads/shared';
import { bidsAdjustInputSchema, targetsGetOutputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { db } from '@/db/index';
import { campaign, target } from '@/db/schema';
import { assertAccountAccess, mapTargetFromApi, resolveAccountContext, updateTargetRow } from './shared';

export const bidsAdjust = apiProcedure
    .input(bidsAdjustInputSchema)
    .output(targetsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const [row] = await db
            .select({
                bidAmount: target.bidAmount,
                negative: target.negative,
                adGroupId: target.adGroupId,
                accountId: campaign.accountId,
            })
            .from(target)
            .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
            .where(and(eq(target.targetId, input.targetId), eq(campaign.accountId, input.config.accountId)))
            .limit(1);

        if (!row) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Target not found.' });
        }

        if (row.negative) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Negative targets do not support bid updates.' });
        }

        if (!row.adGroupId) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign-level targets do not support bid updates.' });
        }

        const currentBid = parseNumeric(row.bidAmount) ?? 0;
        const nextBid = currentBid + input.delta;
        if (nextBid <= 0) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Adjusted bid must be greater than 0.' });
        }

        const response = await updateTargets({
            profileId: account.profileId,
            region: account.region,
            targets: [
                {
                    targetId: input.targetId,
                    bid: { bid: nextBid },
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        await updateTargetRow(input.targetId, { bid: nextBid });
        return { item };
    });
