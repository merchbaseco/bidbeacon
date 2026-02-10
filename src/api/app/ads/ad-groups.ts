import { privateProcedure } from '@/api/trpc';
import { buildAdGroupsRouter } from '../../shared/ads/ad-groups-router';

export const adGroupsRouter = buildAdGroupsRouter(privateProcedure);
