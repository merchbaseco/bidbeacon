import { metricsTableAdsOutputSchema, metricsTableInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getMetricsTable } from './shared';

export const metricsTableAds = apiProcedure
    .input(metricsTableInputSchema)
    .output(metricsTableAdsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetricsTable(input.config, 'ad', {
            campaignId: input.campaignId,
            adGroupId: input.adGroupId,
            ids: input.ids,
            filters: input.filters ?? undefined,
            metrics: input.metrics ?? undefined,
            range: input.range ?? undefined,
            sort: input.sort ?? { field: 'spend', direction: 'desc' },
            limit: input.limit ?? 200,
            offset: input.offset ?? 0,
        });
    });
