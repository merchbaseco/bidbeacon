import { extractMultiStatusEntity, updateTargets } from '@/amazon-ads/sp-entities';
import { targetsGetOutputSchema, targetsStateInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapTargetFromApi, resolveAccountContext, updateTargetRow } from './shared';

export const targetsPause = apiProcedure
    .input(targetsStateInputSchema)
    .output(targetsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await updateTargets({
            profileId: account.profileId,
            region: account.region,
            targets: [
                {
                    targetId: input.targetId,
                    state: 'PAUSED',
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        await updateTargetRow(input.targetId, { state: 'PAUSED' });
        return { item };
    });
