import { enumsStateOutputSchema, stateSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';

export const enumsState = apiProcedure.output(enumsStateOutputSchema).query(async () => {
    return { items: stateSchema.options };
});
