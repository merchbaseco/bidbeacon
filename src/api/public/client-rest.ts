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

export const clientRestProcedures = {
    'accounts/list': accountsList,
    'campaigns/list': campaignsList,
    'campaigns/get': campaignsGet,
    'campaigns/create': campaignsCreate,
    'campaigns/update': campaignsUpdate,
    'campaigns/pause': campaignsPause,
    'campaigns/resume': campaignsResume,
    'campaigns/delete': campaignsDelete,
    'campaigns/set-budget': campaignsSetBudget,
    'campaigns/set-bid-strategy': campaignsSetBidStrategy,
    'campaigns/set-bid-adjustments': campaignsSetBidAdjustments,
    'ad-groups/list': adGroupsList,
    'ad-groups/get': adGroupsGet,
    'ad-groups/create': adGroupsCreate,
    'ad-groups/update': adGroupsUpdate,
    'ad-groups/set-default-bid': adGroupsSetDefaultBid,
    'ad-groups/pause': adGroupsPause,
    'ad-groups/resume': adGroupsResume,
    'ad-groups/delete': adGroupsDelete,
    'ads/list': adsList,
    'ads/get': adsGet,
    'ads/create': adsCreate,
    'ads/update': adsUpdate,
    'ads/delete': adsDelete,
    'asins/get': asinsGet,
    'history/list': historyList,
    'targets/list': targetsList,
    'targets/get': targetsGet,
    'targets/create/keyword': targetsCreateKeyword,
    'targets/create/product': targetsCreateProduct,
    'targets/delete': targetsDelete,
    'targets/pause': targetsPause,
    'targets/resume': targetsResume,
    'bids/set': bidsSet,
    'bids/adjust': bidsAdjust,
    'metrics/series/campaigns': metricsSeriesCampaigns,
    'metrics/series/ad-groups': metricsSeriesAdGroups,
    'metrics/series/ads': metricsSeriesAds,
    'metrics/series/targets': metricsSeriesTargets,
    'metrics/table/campaigns': metricsTableCampaigns,
    'metrics/table/ad-groups': metricsTableAdGroups,
    'metrics/table/ads': metricsTableAds,
    'metrics/table/targets': metricsTableTargets,
    'enums/bid-strategy': enumsBidStrategy,
    'enums/match-type': enumsMatchType,
    'enums/placement': enumsPlacement,
    'enums/state': enumsState,
} as const;
