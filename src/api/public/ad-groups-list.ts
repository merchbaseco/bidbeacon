import { adGroupsListInputSchema, adGroupsListOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, listAdGroups } from './shared';

export const adGroupsList = apiProcedure
    .input(adGroupsListInputSchema)
    .output(adGroupsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAdGroups(input.config, {
            state: input.state,
            campaignId: input.campaignId,
            limit: input.limit,
            offset: input.offset,
        });
        return { items };
    });
