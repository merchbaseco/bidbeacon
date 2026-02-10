import { enumsMatchTypeOutputSchema, keywordMatchTypeSchema, productMatchTypeSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';

export const enumsMatchType = apiProcedure.output(enumsMatchTypeOutputSchema).query(async () => {
    return {
        keyword: keywordMatchTypeSchema.options,
        product: productMatchTypeSchema.options,
    };
});
