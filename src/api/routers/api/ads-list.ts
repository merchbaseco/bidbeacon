import { apiProcedure } from '@/api/trpc';
import { adsListInputSchema, adsListOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listAds } from './shared';

export const adsList = apiProcedure
    .input(adsListInputSchema)
    .output(adsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAds(input.config, {
            state: input.state,
            campaignId: input.campaignId,
            adGroupId: input.adGroupId,
        });
        return { items };
    });
