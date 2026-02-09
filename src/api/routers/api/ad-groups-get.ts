import { z } from 'zod';
import { adGroupsGetOutputSchema, cliConfigInputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';
import { assertAccountAccess, getAdGroup } from './shared';

export const adGroupsGet = apiProcedure
    .input(cliConfigInputSchema.extend({ adGroupId: z.string() }))
    .output(adGroupsGetOutputSchema)
    .query(async ({ ctx, input }) => {
        assertAccountAccess(ctx, input.config);
        const item = await getAdGroup(input.config, input.adGroupId);
        return { item };
    });
