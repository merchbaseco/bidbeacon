import { apiProcedure } from '@/api/trpc';
import { cliListInputSchema, targetsListOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, listTargets } from './shared';

export const targetsList = apiProcedure
    .input(cliListInputSchema)
    .output(targetsListOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const items = await listTargets(input.config, { state: input.state });
        return { items };
    });
