import { z } from 'zod';
import { adGroupsGetOutputSchema, publicConfigInputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getAdGroup } from './shared';

export const adGroupsGet = apiProcedure
    .input(publicConfigInputSchema.extend({ adGroupId: z.string() }))
    .output(adGroupsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getAdGroup(input.config, input.adGroupId);
        return { item };
    });
