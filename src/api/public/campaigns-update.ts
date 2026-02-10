import { extractMultiStatusEntity, updateCampaigns } from '@/amazon-ads/sp-entities';
import { campaignsGetOutputSchema, campaignsUpdateInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, mapCampaignFromApi, resolveAccountContext, updateCampaignRow } from './shared';

export const campaignsUpdate = apiProcedure
    .input(campaignsUpdateInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);

        const payload: Record<string, unknown> = {
            campaignId: input.campaignId,
        };

        if (input.name) {
            payload.name = input.name;
        }
        if (input.portfolioId !== undefined) {
            payload.portfolioId = input.portfolioId;
        }
        if (input.startDateTime) {
            payload.startDateTime = input.startDateTime;
        }
        if (input.endDateTime !== undefined) {
            payload.endDateTime = input.endDateTime;
        }

        const response = await updateCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [payload],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        await updateCampaignRow(input.campaignId, {
            name: input.name,
            portfolioId: input.portfolioId,
            startDateTime: input.startDateTime ?? null,
            endDateTime: input.endDateTime ?? null,
        });
        return { item };
    });
