import { router } from '@/api/trpc';
import { adGroupsApiRouter } from './ads/ad-groups';
import { adsEntitiesApiRouter } from './ads/ads-entities';
import { campaignsApiRouter } from './ads/campaigns';
import { targetsApiRouter } from './ads/targets';

export const adsApiRouter = router({
    campaigns: campaignsApiRouter,
    adGroups: adGroupsApiRouter,
    ads: adsEntitiesApiRouter,
    targets: targetsApiRouter,
});
