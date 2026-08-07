import type { InferInsertModel } from 'drizzle-orm';
import type { adGroup, advertiserAccount, campaign, performanceDaily, reportDatasetMetadata, target } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type PerformanceDailyInsert = InferInsertModel<typeof performanceDaily>;
type ReportDatasetMetadataInsert = InferInsertModel<typeof reportDatasetMetadata>;
type TargetInsert = InferInsertModel<typeof target>;

export const SEARCH_TARGET_ACCOUNT_ID = '00000000-0000-4000-8000-000000000401';
export const SEARCH_TARGET_OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000402';

export const buildSearchTargetAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: SEARCH_TARGET_ACCOUNT_ID,
    adsAccountId: 'search-target-ads-account-1',
    accountName: 'Search target advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'search-target-profile-1',
    entityId: 'search-target-entity-1',
    enabled: true,
    ...overrides,
});

export const buildSearchTargetCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'search-target-campaign-row-1',
    campaignId: 'search-target-campaign-1',
    accountId: 'search-target-ads-account-1',
    countryCode: 'US',
    name: 'Search target campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    startDate: '2026-08-01',
    endDate: null,
    targetingSettings: 'MANUAL',
    bidStrategy: 'SALES_DOWN_ONLY',
    budgetType: 'DAILY',
    budgetPeriod: 'DAILY',
    budgetAmount: '30.00',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildSearchTargetAdGroupId = 'search-target-ad-group-1';

export const buildSearchTargetAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'search-target-ad-group-row-1',
    adGroupId: buildSearchTargetAdGroupId,
    campaignId: 'search-target-campaign-1',
    name: 'Search target ad group',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    bidAmount: '0.30',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildSearchTarget = (overrides: Partial<TargetInsert> = {}): TargetInsert => ({
    id: 'search-target-row-1',
    campaignId: 'search-target-campaign-1',
    targetId: 'search-target-keyword-1',
    adGroupId: buildSearchTargetAdGroupId,
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    negative: false,
    bidAmount: '0.45',
    targetMatchType: 'EXACT',
    targetAsin: null,
    targetKeyword: 'funny cat shirt',
    targetType: 'KEYWORD',
    deliveryStatus: 'DELIVERING',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildSearchTargetPerformanceDaily = (overrides: Partial<PerformanceDailyInsert> = {}): PerformanceDailyInsert => ({
    accountId: 'search-target-ads-account-1',
    bucketStart: new Date('2026-08-06T07:00:00.000Z'),
    bucketDate: '2026-08-06',
    campaignId: 'search-target-campaign-1',
    adGroupId: buildSearchTargetAdGroupId,
    adId: 'search-target-ad-1',
    entityType: 'target',
    entityId: 'search-target-keyword-1',
    targetMatchType: 'EXACT',
    impressions: 40,
    clicks: 4,
    spend: '4.00',
    sales: '8.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchTargetReportMetadata = (date: string, overrides: Partial<ReportDatasetMetadataInsert> = {}): ReportDatasetMetadataInsert => ({
    accountId: 'search-target-ads-account-1',
    countryCode: 'US',
    periodStart: new Date(`${date}T07:00:00.000Z`),
    aggregation: 'daily',
    entityType: 'target',
    status: 'completed',
    refreshing: false,
    totalRecords: 1,
    successRecords: 1,
    errorRecords: 0,
    nextRefreshAt: null,
    lastReportCreatedAt: new Date(`${date}T08:00:00.000Z`),
    reportId: `search-target-report-${date}`,
    lastProcessedReportId: `search-target-report-${date}`,
    error: null,
    ...overrides,
});
