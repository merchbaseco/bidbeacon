import { z } from 'zod';
import { apiProcedure } from '@/api/trpc';
import { cliConfigInputSchema, targetsGetOutputSchema } from '@/api/schemas/cli';
import { assertAccountAccess, getTarget } from './shared';

export const targetsGet = apiProcedure
    .input(cliConfigInputSchema.extend({ targetId: z.string() }))
    .output(targetsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getTarget(input.config, input.targetId);
        return { item };
    });
