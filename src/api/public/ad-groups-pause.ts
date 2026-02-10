import { extractMultiStatusEntity, updateAdGroups } from '@/amazon-ads/sp-entities';
import { adGroupsGetOutputSchema, adGroupsStateInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapAdGroupFromApi, resolveAccountContext, updateAdGroupRow } from './shared';

export const adGroupsPause = apiProcedure
    .input(adGroupsStateInputSchema)
    .output(adGroupsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await updateAdGroups({
            profileId: account.profileId,
            region: account.region,
            adGroups: [
                {
                    adGroupId: input.adGroupId,
                    state: 'PAUSED',
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'adGroup', value => mapAdGroupFromApi(value as Record<string, unknown>));
        await updateAdGroupRow(input.adGroupId, { state: 'PAUSED' });
        return { item };
    });
