import { privateProcedure } from '@/api/trpc';
import { buildAdsEntitiesRouter } from '../shared/ads/ads-entities-router';

export const adsEntitiesRouter = buildAdsEntitiesRouter(privateProcedure);
