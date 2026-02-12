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
import { asinsGet } from './asins-get';
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
import { historyList } from './history-list';
import { metricsSeriesAdGroups } from './metrics-series-ad-groups';
import { metricsSeriesAds } from './metrics-series-ads';
import { metricsSeriesCampaigns } from './metrics-series-campaigns';
import { metricsSeriesTargets } from './metrics-series-targets';
import { metricsTableAdGroups } from './metrics-table-ad-groups';
import { metricsTableAds } from './metrics-table-ads';
import { metricsTableCampaigns } from './metrics-table-campaigns';
import { metricsTableTargets } from './metrics-table-targets';
import { targetsCreateKeyword } from './targets-create-keyword';
import { targetsCreateProduct } from './targets-create-product';
import { targetsDelete } from './targets-delete';
import { targetsGet } from './targets-get';
import { targetsList } from './targets-list';
import { targetsPause } from './targets-pause';
import { targetsResume } from './targets-resume';

export const clientApiRouter = router({
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
    asinsGet,
    historyList,
    targetsList,
    targetsGet,
    targetsCreateKeyword,
    targetsCreateProduct,
    targetsDelete,
    targetsPause,
    targetsResume,
    bidsSet,
    bidsAdjust,
    metricsSeriesCampaigns,
    metricsSeriesAdGroups,
    metricsSeriesAds,
    metricsSeriesTargets,
    metricsTableCampaigns,
    metricsTableAdGroups,
    metricsTableAds,
    metricsTableTargets,
    enumsBidStrategy,
    enumsMatchType,
    enumsPlacement,
    enumsState,
});
