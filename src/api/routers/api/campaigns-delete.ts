import { assertDeleteResponse, deleteCampaigns } from '@/amazon-ads/sp-entities';
import { campaignsDeleteInputSchema, campaignsGetOutputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import type { CampaignShape } from './shared';
import { assertAccountAccess, resolveAccountContext } from './shared';

export const campaignsDelete = apiProcedure
    .input(campaignsDeleteInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await deleteCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [
                {
                    campaignId: input.campaignId,
                },
            ],
        });

        assertDeleteResponse(response, 'campaign');
        return { item: buildDeletedCampaign(input.campaignId) };
    });

const buildDeletedCampaign = (campaignId: string): CampaignShape => ({
    campaignId,
    name: '[deleted]',
    state: 'ARCHIVED',
    budget: 0,
    bidStrategy: null,
    startDateTime: null,
    endDateTime: null,
    portfolioId: null,
});
