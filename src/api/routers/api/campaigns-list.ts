import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, campaignsListOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listCampaigns } from './shared';

export const campaignsList = apiProcedure
    .input(cliConfigInputSchema)
    .output(campaignsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listCampaigns(input.config);
        return { items };
    });
