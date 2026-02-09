import { apiProcedure } from '@/api/trpc';
import { metricsSeriesInputSchema, metricsSeriesOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetricsSeries } from './shared';

export const metricsSeriesAdGroups = apiProcedure
    .input(metricsSeriesInputSchema)
    .output(metricsSeriesOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetricsSeries(input.config, 'adGroup', {
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
