import { apiProcedure } from '@/api/trpc';
import { campaignsGetOutputSchema, campaignsStateInputSchema } from '@/api/schemas/cli';
import { updateCampaigns, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, mapCampaignFromApi, resolveAccountContext, updateCampaignRow } from './shared';

export const campaignsResume = apiProcedure
    .input(campaignsStateInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const response = await updateCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [
                {
                    campaignId: input.campaignId,
                    state: 'ENABLED',
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        await updateCampaignRow(input.campaignId, { state: 'ENABLED' });
        return { item };
    });
