import { privateProcedure } from '@/api/trpc';
import { buildReportsRouter } from './shared/reports-router';

export const reportsRouter = buildReportsRouter(privateProcedure);
