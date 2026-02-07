import { z } from 'zod';
import { apiProcedure } from '@/api/trpc';
import { campaignsGetOutputSchema, cliConfigInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getCampaign } from './shared';

export const campaignsGet = apiProcedure
    .input(cliConfigInputSchema.extend({ campaignId: z.string() }))
    .output(campaignsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getCampaign(input.config, input.campaignId);
        return { item };
    });
