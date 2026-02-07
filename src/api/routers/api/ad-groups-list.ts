import { apiProcedure } from '@/api/trpc';
import { adGroupsListOutputSchema, cliListInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listAdGroups } from './shared';

export const adGroupsList = apiProcedure
    .input(cliListInputSchema)
    .output(adGroupsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAdGroups(input.config, { state: input.state });
        return { items };
    });
