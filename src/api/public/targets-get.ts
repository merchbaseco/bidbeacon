import { z } from 'zod';
import { publicConfigInputSchema, targetsGetOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getTarget } from './shared';

export const targetsGet = apiProcedure
    .input(publicConfigInputSchema.extend({ targetId: z.string() }))
    .output(targetsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getTarget(input.config, input.targetId);
        return { item };
    });
