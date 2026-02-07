import { apiProcedure } from '@/api/trpc';
import { targetsGetOutputSchema, targetsStateInputSchema } from '@/api/schemas/cli';
import { updateTargets, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, mapTargetFromApi, resolveAccountContext, updateTargetRow } from './shared';

export const targetsResume = apiProcedure
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
                    state: 'ENABLED',
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'target', value => mapTargetFromApi(value as Record<string, unknown>));
        await updateTargetRow(input.targetId, { state: 'ENABLED' });
        return { item };
    });
