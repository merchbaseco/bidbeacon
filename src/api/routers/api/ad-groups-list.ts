import { apiProcedure } from '@/api/trpc';
import { adGroupsListOutputSchema, cliConfigInputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listAdGroups } from './shared';

export const adGroupsList = apiProcedure
    .input(cliConfigInputSchema)
    .output(adGroupsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listAdGroups(input.config);
        return { items };
    });
