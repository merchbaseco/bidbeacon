import { apiProcedure } from '@/api/trpc';
import { campaignsGetOutputSchema, campaignsSetBidStrategyInputSchema } from '@/api/schemas/cli';
import { updateCampaigns, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, mapCampaignFromApi, resolveAccountContext, updateCampaignRow } from './shared';

export const campaignsSetBidStrategy = apiProcedure
    .input(campaignsSetBidStrategyInputSchema)
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
                    optimizations: {
                        bidSettings: {
                            bidStrategy: input.strategy,
                        },
                    },
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        await updateCampaignRow(input.campaignId, { bidStrategy: input.strategy });
        return { item };
    });
