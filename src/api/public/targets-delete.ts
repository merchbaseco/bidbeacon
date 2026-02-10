import { z } from 'zod';
import { assertDeleteResponse, deleteTargets } from '@/amazon-ads/sp-entities';
import { targetsDeleteInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, resolveAccountContext, updateTargetRow } from './shared';

export const targetsDelete = apiProcedure
    .input(targetsDeleteInputSchema)
    .output(z.object({ deleted: z.literal(true), targetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await deleteTargets({
            profileId: account.profileId,
            region: account.region,
            targets: [
                {
                    targetId: input.targetId,
                },
            ],
        });

        assertDeleteResponse(response, 'target');
        await updateTargetRow(input.targetId, { state: 'ARCHIVED' });
        return { deleted: true, targetId: input.targetId };
    });
