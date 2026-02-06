import { apiProcedure } from '@/api/trpc';
import { buildPerformanceRouter } from '../shared/performance-router';

export const performanceApiRouter = buildPerformanceRouter(apiProcedure);
