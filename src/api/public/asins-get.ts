import { asinsGetInputSchema, asinsGetOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getAsinCampaignTree } from './shared';

export const asinsGet = apiProcedure
    .input(asinsGetInputSchema)
    .output(asinsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getAsinCampaignTree(input.config, input.asin);
    });
