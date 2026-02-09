import { apiProcedure } from '@/api/trpc';
import { metricsListInputSchema, metricsOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetrics } from './shared';

export const metricsTargets = apiProcedure
    .input(metricsListInputSchema)
    .output(metricsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetrics(input.config, 'target', undefined, {
            campaignId: input.campaignId,
            adGroupId: input.adGroupId,
        });
    });
