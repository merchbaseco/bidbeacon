import { apiProcedure } from '@/api/trpc';
import { buildAdsEntitiesRouter } from '../../shared/ads/ads-entities-router';

export const adsEntitiesApiRouter = buildAdsEntitiesRouter(apiProcedure);
