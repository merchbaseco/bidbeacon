import { apiProcedure } from '@/api/trpc';
import { metricsTableAdGroupsOutputSchema, metricsTableInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getMetricsTable } from './shared';

export const metricsTableAdGroups = apiProcedure
    .input(metricsTableInputSchema)
    .output(metricsTableAdGroupsOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        return getMetricsTable(input.config, 'adGroup', {
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
