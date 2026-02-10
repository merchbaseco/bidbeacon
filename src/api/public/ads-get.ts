import { z } from 'zod';
import { adsGetOutputSchema, publicConfigInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getAd } from './shared';

export const adsGet = apiProcedure
    .input(publicConfigInputSchema.extend({ adId: z.string() }))
    .output(adsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getAd(input.config, input.adId);
        return { item };
    });
