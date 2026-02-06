import { apiProcedure } from '@/api/trpc';
import { buildCampaignsRouter } from '../../shared/ads/campaigns-router';

export const campaignsApiRouter = buildCampaignsRouter(apiProcedure);
