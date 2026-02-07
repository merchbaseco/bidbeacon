import { apiProcedure } from '@/api/trpc';
import { enumsPlacementOutputSchema, placementSchema } from '@/api/schemas/cli';

export const enumsPlacement = apiProcedure.output(enumsPlacementOutputSchema).query(async () => {
    return { items: placementSchema.options };
});
