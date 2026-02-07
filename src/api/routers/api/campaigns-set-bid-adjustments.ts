import { apiProcedure } from '@/api/trpc';
import { campaignsGetOutputSchema, campaignsSetBidAdjustmentsInputSchema } from '@/api/schemas/cli';
import { updateCampaigns, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import { assertAccountAccess, mapCampaignFromApi, resolveAccountContext } from './shared';

export const campaignsSetBidAdjustments = apiProcedure
    .input(campaignsSetBidAdjustmentsInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const bidAdjustments =
            input.scope === 'placement'
                ? { placementBidAdjustments: input.adjustments }
                : input.scope === 'audience'
                ? { audienceBidAdjustments: input.adjustments }
                : { creativeBidAdjustments: input.adjustments };

        const response = await updateCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [
                {
                    campaignId: input.campaignId,
                    optimizations: {
                        bidSettings: {
                            bidAdjustments,
                        },
                    },
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        return { item };
    });
