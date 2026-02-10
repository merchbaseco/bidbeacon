import { adsListInputSchema, adsListOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
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
            limit: input.limit,
            offset: input.offset,
        });
        return { items };
    });
