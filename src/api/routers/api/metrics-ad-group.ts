import { z } from 'zod';
import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, metricsOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetrics } from './shared';

export const metricsAdGroup = apiProcedure
    .input(cliConfigInputSchema.extend({ adGroupId: z.string() }))
    .output(metricsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetrics(input.config, 'adGroup', input.adGroupId);
    });
