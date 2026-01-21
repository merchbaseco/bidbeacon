import { router } from '../trpc';
import { adGroupsRouter } from './ads/ad-groups';
import { adsEntitiesRouter } from './ads/ads-entities';
import { campaignsRouter } from './ads/campaigns';
import { targetsRouter } from './ads/targets';

export const adsRouter = router({
    campaigns: campaignsRouter,
    adGroups: adGroupsRouter,
    ads: adsEntitiesRouter,
    targets: targetsRouter,
});
