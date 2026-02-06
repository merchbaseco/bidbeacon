import { apiProcedure } from '@/api/trpc';
import { buildAdGroupsRouter } from '../../shared/ads/ad-groups-router';

export const adGroupsApiRouter = buildAdGroupsRouter(apiProcedure);
