import { apiProcedure } from '@/api/trpc';
import { campaignsCreateInputSchema, campaignsGetOutputSchema } from '@/api/schemas/cli';
import { createCampaigns, extractMultiStatusEntity } from '@/amazon-ads/sp-entities';
import {
    assertAccountAccess,
    buildCampaignBudgetPayload,
    getCurrencyForCountry,
    mapCampaignFromApi,
    resolveAccountContext,
} from './shared';

export const campaignsCreate = apiProcedure
    .input(campaignsCreateInputSchema)
    .output(campaignsGetOutputSchema)
    .mutation(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const account = await resolveAccountContext(input.config);
        const currencyCode = getCurrencyForCountry(account.countryCode);
        const countries = account.countryCode ? [account.countryCode.toUpperCase()] : [];

        const response = await createCampaigns({
            profileId: account.profileId,
            region: account.region,
            campaigns: [
                {
                    adProduct: 'SPONSORED_PRODUCTS',
                    name: input.name,
                    state: 'PAUSED',
                    startDateTime: new Date().toISOString(),
                    marketplaceScope: 'SINGLE_MARKETPLACE',
                    countries,
                    autoCreationSettings: {
                        autoCreateTargets: false,
                    },
                    budgets: buildCampaignBudgetPayload(input.budget, currencyCode),
                },
            ],
        });

        const item = extractMultiStatusEntity(response, 'campaign', value => mapCampaignFromApi(value as Record<string, unknown>));
        return { item };
    });
