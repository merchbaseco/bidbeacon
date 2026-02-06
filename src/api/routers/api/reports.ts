import { apiProcedure } from '@/api/trpc';
import { buildReportsRouter } from '../shared/reports-router';

export const reportsApiRouter = buildReportsRouter(apiProcedure);
