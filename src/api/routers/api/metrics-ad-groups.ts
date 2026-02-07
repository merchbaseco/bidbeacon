import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, metricsOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetrics } from './shared';

export const metricsAdGroups = apiProcedure
    .input(cliConfigInputSchema)
    .output(metricsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetrics(input.config, 'adGroup');
    });
