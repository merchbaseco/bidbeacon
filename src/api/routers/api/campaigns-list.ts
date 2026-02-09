import { campaignsListOutputSchema, cliListInputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, listCampaigns } from './shared';

export const campaignsList = apiProcedure
    .input(cliListInputSchema)
    .output(campaignsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listCampaigns(input.config, { state: input.state, limit: input.limit, offset: input.offset });
        return { items };
    });
