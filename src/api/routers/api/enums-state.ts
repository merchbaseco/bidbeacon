import { enumsStateOutputSchema, stateSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';

export const enumsState = apiProcedure.output(enumsStateOutputSchema).query(async () => {
    return { items: stateSchema.options };
});
