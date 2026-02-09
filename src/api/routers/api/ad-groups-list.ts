import { adGroupsListInputSchema, adGroupsListOutputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, listAdGroups } from './shared';

export const adGroupsList = apiProcedure
    .input(adGroupsListInputSchema)
    .output(adGroupsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAdGroups(input.config, { state: input.state, campaignId: input.campaignId });
        return { items };
    });
