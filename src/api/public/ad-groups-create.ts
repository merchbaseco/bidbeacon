import { createAdGroups, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { adGroupsCreateInputSchema, adGroupsGetOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapAdGroupFromApi, resolveAccountContext } from './shared';

export const adGroupsCreate = apiProcedure
    .input(adGroupsCreateInputSchema)
    .output(adGroupsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await createAdGroups({
            profileId: account.profileId,
            region: account.region,
            adGroups: [
                {
                    adProduct: 'SPONSORED_PRODUCTS',
                    campaignId: input.campaignId,
                    name: input.name,
                    bid: {
                        defaultBid: input.defaultBid,
                    },
                    state: 'PAUSED',
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'adGroup', value => mapAdGroupFromApi(value as Record<string, unknown>));
        return { item };
    });
