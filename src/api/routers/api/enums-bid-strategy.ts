import { bidStrategySchema, enumsBidStrategyOutputSchema } from '@/api/schemas/cli';
import { apiProcedure } from '@/api/trpc';

export const enumsBidStrategy = apiProcedure.output(enumsBidStrategyOutputSchema).query(async () => {
    return { items: bidStrategySchema.options };
});
