import { z } from 'zod';
import { campaignsGetOutputSchema, publicConfigInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getCampaign } from './shared';

export const campaignsGet = apiProcedure
    .input(publicConfigInputSchema.extend({ campaignId: z.string() }))
    .output(campaignsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getCampaign(input.config, input.campaignId);
        return { item };
    });
