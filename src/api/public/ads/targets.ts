import { apiProcedure } from '@/api/trpc';
import { buildTargetsRouter } from '../../shared/ads/targets-router';

export const targetsApiRouter = buildTargetsRouter(apiProcedure);
