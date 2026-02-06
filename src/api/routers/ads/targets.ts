import { privateProcedure } from '@/api/trpc';
import { buildTargetsRouter } from '../shared/ads/targets-router';

export const targetsRouter = buildTargetsRouter(privateProcedure);
