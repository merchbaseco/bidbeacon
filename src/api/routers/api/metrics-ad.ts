import { z } from 'zod';
import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, metricsOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetrics } from './shared';

export const metricsAd = apiProcedure
    .input(cliConfigInputSchema.extend({ adId: z.string() }))
    .output(metricsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetrics(input.config, 'ad', input.adId);
    });
