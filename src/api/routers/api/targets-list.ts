import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, targetsListOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listTargets } from './shared';

export const targetsList = apiProcedure
    .input(cliConfigInputSchema)
    .output(targetsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listTargets(input.config);
        return { items };
    });
