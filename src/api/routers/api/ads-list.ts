import { apiProcedure } from '@/api/trpc';
import { adsListOutputSchema, cliConfigInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listAds } from './shared';

export const adsList = apiProcedure
    .input(cliConfigInputSchema)
    .output(adsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAds(input.config);
        return { items };
    });
