import { enumsMatchTypeOutputSchema, keywordMatchTypeSchema, productMatchTypeSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';

export const enumsMatchType = apiProcedure.output(enumsMatchTypeOutputSchema).query(async () => {
    return {
        keyword: keywordMatchTypeSchema.options,
        product: productMatchTypeSchema.options,
    };
});
