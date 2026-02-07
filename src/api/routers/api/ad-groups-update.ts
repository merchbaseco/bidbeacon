import { apiProcedure } from '@/api/trpc';
import { adGroupsGetOutputSchema, adGroupsUpdateInputSchema } from '@/api/schemas/cli';
import { updateAdGroups, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, mapAdGroupFromApi, resolveAccountContext, updateAdGroupRow } from './shared';

export const adGroupsUpdate = apiProcedure
    .input(adGroupsUpdateInputSchema)
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
                    name: input.name,
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'adGroup', value => mapAdGroupFromApi(value as Record<string, unknown>));
        await updateAdGroupRow(input.adGroupId, { name: input.name });
        return { item };
    });
