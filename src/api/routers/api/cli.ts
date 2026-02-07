import { router } from '@/api/trpc';
import { accountsList } from './accounts-list';
import { adGroupsCreate } from './ad-groups-create';
import { adGroupsDelete } from './ad-groups-delete';
import { adGroupsGet } from './ad-groups-get';
import { adGroupsList } from './ad-groups-list';
import { adGroupsPause } from './ad-groups-pause';
import { adGroupsResume } from './ad-groups-resume';
import { adGroupsSetDefaultBid } from './ad-groups-set-default-bid';
import { adGroupsUpdate } from './ad-groups-update';
import { adsCreate } from './ads-create';
import { adsDelete } from './ads-delete';
import { adsGet } from './ads-get';
import { adsList } from './ads-list';
import { adsUpdate } from './ads-update';
import { bidsAdjust } from './bids-adjust';
import { bidsSet } from './bids-set';
import { campaignsCreate } from './campaigns-create';
import { campaignsDelete } from './campaigns-delete';
import { campaignsGet } from './campaigns-get';
import { campaignsList } from './campaigns-list';
import { campaignsPause } from './campaigns-pause';
import { campaignsResume } from './campaigns-resume';
import { campaignsSetBidAdjustments } from './campaigns-set-bid-adjustments';
import { campaignsSetBidStrategy } from './campaigns-set-bid-strategy';
import { campaignsSetBudget } from './campaigns-set-budget';
import { campaignsUpdate } from './campaigns-update';
import { enumsBidStrategy } from './enums-bid-strategy';
import { enumsMatchType } from './enums-match-type';
import { enumsPlacement } from './enums-placement';
import { enumsState } from './enums-state';
import { metricsAd } from './metrics-ad';
import { metricsAdGroup } from './metrics-ad-group';
import { metricsAdGroups } from './metrics-ad-groups';
import { metricsAds } from './metrics-ads';
import { metricsCampaign } from './metrics-campaign';
import { metricsCampaigns } from './metrics-campaigns';
import { metricsTarget } from './metrics-target';
import { metricsTargets } from './metrics-targets';
import { targetsCreateKeyword } from './targets-create-keyword';
import { targetsCreateProduct } from './targets-create-product';
import { targetsDelete } from './targets-delete';
import { targetsGet } from './targets-get';
import { targetsList } from './targets-list';
import { targetsPause } from './targets-pause';
import { targetsResume } from './targets-resume';

export const cliApiRouter = router({
    accountsList,
    campaignsList,
    campaignsGet,
    campaignsCreate,
    campaignsUpdate,
    campaignsPause,
    campaignsResume,
    campaignsDelete,
    campaignsSetBudget,
    campaignsSetBidStrategy,
    campaignsSetBidAdjustments,
    adGroupsList,
    adGroupsGet,
    adGroupsCreate,
    adGroupsUpdate,
    adGroupsSetDefaultBid,
    adGroupsPause,
    adGroupsResume,
    adGroupsDelete,
    adsList,
    adsGet,
    adsCreate,
    adsUpdate,
    adsDelete,
    targetsList,
    targetsGet,
    targetsCreateKeyword,
    targetsCreateProduct,
    targetsDelete,
    targetsPause,
    targetsResume,
    bidsSet,
    bidsAdjust,
    metricsCampaigns,
    metricsAdGroups,
    metricsAds,
    metricsTargets,
    metricsCampaign,
    metricsAdGroup,
    metricsAd,
    metricsTarget,
    enumsBidStrategy,
    enumsMatchType,
    enumsPlacement,
    enumsState,
});
