import { privateProcedure } from '@/api/trpc';
import { buildCampaignsRouter } from '../../shared/ads/campaigns-router';

export const campaignsRouter = buildCampaignsRouter(privateProcedure);
