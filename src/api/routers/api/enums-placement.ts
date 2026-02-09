import { enumsPlacementOutputSchema, placementSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';

export const enumsPlacement = apiProcedure.output(enumsPlacementOutputSchema).query(async () => {
    return { items: placementSchema.options };
});
