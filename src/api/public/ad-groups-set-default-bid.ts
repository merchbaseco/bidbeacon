import { extractMultiStatusEntity, updateAdGroups } from '@/amazon-ads/sp-entities';
import { adGroupsGetOutputSchema, adGroupsSetDefaultBidInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapAdGroupFromApi, resolveAccountContext, updateAdGroupRow } from './shared';

export const adGroupsSetDefaultBid = apiProcedure
    .input(adGroupsSetDefaultBidInputSchema)
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
                    bid: {
                        defaultBid: input.value,
                    },
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'adGroup', value => mapAdGroupFromApi(value as Record<string, unknown>));
        await updateAdGroupRow(input.adGroupId, { defaultBid: input.value });
        return { item };
    });
