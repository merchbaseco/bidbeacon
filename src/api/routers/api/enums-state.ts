import { apiProcedure } from '@/api/trpc';
import { enumsStateOutputSchema, stateSchema } from '@/api/schemas/cli';

export const enumsState = apiProcedure.output(enumsStateOutputSchema).query(async () => {
    return { items: stateSchema.options };
});
