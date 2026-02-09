import { apiProcedure } from '@/api/trpc';
import { adGroupsDeleteInputSchema, adGroupsGetOutputSchema } from '@/api/schemas/cli';
import { assertDeleteResponse, deleteAdGroups } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, resolveAccountContext } from './shared';
import type { AdGroupShape } from './shared';

export const adGroupsDelete = apiProcedure
    .input(adGroupsDeleteInputSchema)
    .output(adGroupsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await deleteAdGroups({
            profileId: account.profileId,
            region: account.region,
            adGroups: [
                {
                    adGroupId: input.adGroupId,
                },
            ],
        });

        assertDeleteResponse(response, 'ad group');
        return { item: buildDeletedAdGroup(input.adGroupId) };
    });

const buildDeletedAdGroup = (adGroupId: string): AdGroupShape => ({
    adGroupId,
    campaignId: '',
    name: '[deleted]',
    defaultBid: 0,
    state: 'ARCHIVED',
});
