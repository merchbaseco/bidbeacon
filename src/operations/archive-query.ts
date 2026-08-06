import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { performanceDaily } from '@/db/schema';
import type { OperationContext } from './operation-context';

export const queryArchivedPerformance = async (context: OperationContext, input: { storageAccountId: string; startDate: string; endDate: string }) =>
    context.db
        .select()
        .from(performanceDaily)
        .where(and(eq(performanceDaily.accountId, input.storageAccountId), gte(performanceDaily.bucketDate, input.startDate), lte(performanceDaily.bucketDate, input.endDate)))
        .orderBy(asc(performanceDaily.bucketDate), asc(performanceDaily.adId), asc(performanceDaily.entityId));
