import { apiProcedure } from '@/api/trpc';
import { enumsMatchTypeOutputSchema, keywordMatchTypeSchema, productMatchTypeSchema } from '@/api/schemas/cli';

export const enumsMatchType = apiProcedure.output(enumsMatchTypeOutputSchema).query(async () => {
    return {
        keyword: keywordMatchTypeSchema.options,
        product: productMatchTypeSchema.options,
    };
});
