import { apiProcedure } from '@/api/trpc';
import { enumsBidStrategyOutputSchema, bidStrategySchema } from '@/api/schemas/cli';

export const enumsBidStrategy = apiProcedure.output(enumsBidStrategyOutputSchema).query(async () => {
    return { items: bidStrategySchema.options };
});
