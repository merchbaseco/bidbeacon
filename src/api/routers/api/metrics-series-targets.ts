import { metricsSeriesInputSchema, metricsSeriesOutputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getMetricsSeries } from './shared';

export const metricsSeriesTargets = apiProcedure
    .input(metricsSeriesInputSchema)
    .output(metricsSeriesOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetricsSeries(input.config, 'target', {
            scope: {
                campaignId: input.campaignId,
                adGroupId: input.adGroupId,
                ids: input.ids,
            },
            filters: input.filters ?? undefined,
            metrics: input.metrics ?? undefined,
            range: input.range ?? undefined,
            bucket: input.bucket ?? undefined,
        });
    });
