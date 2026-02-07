import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { apiProcedure } from '@/api/trpc';
import { bidsSetInputSchema, targetsGetOutputSchema } from '@/api/schemas/cli';
import { updateTargets, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { db } from '@/db/index';
import { campaign, target } from '@/db/schema';
import { assertAccountAccess, mapTargetFromApi, resolveAccountContext, updateTargetRow } from './shared';

export const bidsSet = apiProcedure
    .input(bidsSetInputSchema)
    .output(targetsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);
        const [row] = await db
            .select({ targetId: target.targetId, negative: target.negative, adGroupId: target.adGroupId, accountId: campaign.accountId })
            .from(target)
            .innerJoin(campaign, eq(target.campaignId, campaign.campaignId))
            .where(and(eq(target.targetId, input.targetId), eq(campaign.accountId, input.config.accountId)))
            .limit(1);

        if (row) {
            if (row.negative) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Negative targets do not support bid updates.' });
            }

            if (!row.adGroupId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Campaign-level targets do not support bid updates.' });
            }
        }

        const response = await updateTargets({
            profileId: account.profileId,
            region: account.region,
            targets: [
                {
                    targetId: input.targetId,
                    bid: { bid: input.value },
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        await updateTargetRow(input.targetId, { bid: input.value });
        return { item };
    });
