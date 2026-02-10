import { targetsListInputSchema, targetsListOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, listTargets } from './shared';

export const targetsList = apiProcedure
    .input(targetsListInputSchema)
    .output(targetsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listTargets(input.config, {
            state: input.state,
            campaignId: input.campaignId,
            adGroupId: input.adGroupId,
            limit: input.limit,
            offset: input.offset,
        });
        return { items };
    });
