import { bidStrategySchema, enumsBidStrategyOutputSchema } from '@/api/public/schemas';
import { apiProcedure } from '@/api/trpc';

export const enumsBidStrategy = apiProcedure.output(enumsBidStrategyOutputSchema).query(async () => {
    return { items: bidStrategySchema.options };
});
