import { privateProcedure } from '@/api/trpc';
import { buildPerformanceRouter } from '../shared/performance-router';

export const performanceRouter = buildPerformanceRouter(privateProcedure);
