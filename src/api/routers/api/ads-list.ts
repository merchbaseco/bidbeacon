import { apiProcedure } from '@/api/trpc';
import { adsListOutputSchema, cliListInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listAds } from './shared';

export const adsList = apiProcedure
    .input(cliListInputSchema)
    .output(adsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAds(input.config, { state: input.state });
        return { items };
    });
