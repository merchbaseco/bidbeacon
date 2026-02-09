import { targetsListInputSchema, targetsListOutputSchema } from '@/api/schemas/cli';
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
        });
        return { items };
    });
