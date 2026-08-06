import { createAdGroups, createAds, createCampaigns, createTargets, updateAdGroups, updateAds, updateCampaigns, updateTargets } from '@/amazon-ads/sp-entities';
import type { AmazonAdsGateway } from './amazon-ads-gateway';

export const productionAmazonAdsGateway = {
    createAdGroups,
    createAds,
    createCampaigns,
    createTargets,
    updateAdGroups,
    updateAds,
    updateCampaigns,
    updateTargets,
} satisfies AmazonAdsGateway;
