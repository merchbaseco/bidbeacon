import { apiProcedure } from '@/api/trpc';
import { campaignsGetOutputSchema, campaignsSetBudgetInputSchema } from '@/api/schemas/cli';
import { updateCampaigns, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import {
    assertAccountAccess,
    buildCampaignBudgetPayload,
    getCurrencyForCountry,
    mapCampaignFromApi,
    resolveAccountContext,
    updateCampaignRow,
} from './shared';

export const campaignsSetBudget = apiProcedure
    .input(campaignsSetBudgetInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);
        const currencyCode = getCurrencyForCountry(account.countryCode);

        const response = await updateCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [
                {
                    campaignId: input.campaignId,
                    budgets: buildCampaignBudgetPayload(input.budget, currencyCode),
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        await updateCampaignRow(input.campaignId, { budget: input.budget });
        return { item };
    });
