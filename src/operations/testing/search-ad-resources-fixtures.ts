import type { InferInsertModel } from 'drizzle-orm';
import type { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, reportDatasetMetadata } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type AdInsert = InferInsertModel<typeof ad>;
type PerformanceDailyInsert = InferInsertModel<typeof performanceDaily>;
type PerformanceHourlyInsert = InferInsertModel<typeof performanceHourly>;
type ReportDatasetMetadataInsert = InferInsertModel<typeof reportDatasetMetadata>;

export const SEARCH_AD_RESOURCES_ACCOUNT_ID = '00000000-0000-4000-8000-000000000201';
export const SEARCH_AD_RESOURCES_OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000202';

export const buildSearchAdResourcesAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: SEARCH_AD_RESOURCES_ACCOUNT_ID,
    adsAccountId: 'search-ad-resources-ads-account-1',
    accountName: 'Search child-resource advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'search-ad-resources-profile-1',
    entityId: 'search-ad-resources-entity-1',
    enabled: true,
    ...overrides,
});

export const buildSearchAdResourcesCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'search-ad-resources-campaign-row-1',
    campaignId: 'search-ad-resources-campaign-1',
    accountId: 'search-ad-resources-ads-account-1',
    countryCode: 'US',
    name: 'Search child-resource campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    startDate: '2026-08-01',
    endDate: null,
    targetingSettings: 'AUTO',
    bidStrategy: 'SALES_DOWN_ONLY',
    budgetType: 'DAILY',
    budgetPeriod: 'DAILY',
    budgetAmount: '30.00',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchAdResourcesAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'search-ad-resources-ad-group-row-1',
    adGroupId: 'search-ad-resources-ad-group-1',
    campaignId: 'search-ad-resources-campaign-1',
    name: 'Search child-resource ad group',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    bidAmount: '0.75',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchAdResourcesAd = (overrides: Partial<AdInsert> = {}): AdInsert => ({
    id: 'search-ad-resources-ad-row-1',
    adId: 'search-ad-resources-ad-1',
    adGroupId: 'search-ad-resources-ad-group-1',
    campaignId: 'search-ad-resources-campaign-1',
    adProduct: 'SPONSORED_PRODUCTS',
    adType: 'PRODUCT_AD',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    productAsin: 'B0SEARCHCHILD001',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchAdResourcesPerformanceDaily = (overrides: Partial<PerformanceDailyInsert> = {}): PerformanceDailyInsert => ({
    accountId: 'search-ad-resources-ads-account-1',
    bucketStart: new Date('2026-08-06T07:00:00.000Z'),
    bucketDate: '2026-08-06',
    campaignId: 'search-ad-resources-campaign-1',
    adGroupId: 'search-ad-resources-ad-group-1',
    adId: 'search-ad-resources-ad-1',
    entityType: 'target',
    entityId: 'search-ad-resources-target-1',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchAdResourcesPerformanceHourly = (overrides: Partial<PerformanceHourlyInsert> = {}): PerformanceHourlyInsert => ({
    accountId: 'search-ad-resources-ads-account-1',
    bucketStart: new Date('2026-08-06T10:00:00.000Z'),
    bucketDate: '2026-08-06',
    bucketHour: 3,
    campaignId: 'search-ad-resources-campaign-1',
    adGroupId: 'search-ad-resources-ad-group-1',
    adId: 'search-ad-resources-ad-1',
    entityType: 'target',
    entityId: 'search-ad-resources-target-1',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchAdResourcesReportMetadata = (date: string, overrides: Partial<ReportDatasetMetadataInsert> = {}): ReportDatasetMetadataInsert => ({
    accountId: 'search-ad-resources-ads-account-1',
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
    reportId: `search-ad-resources-report-${date}`,
    lastProcessedReportId: `search-ad-resources-report-${date}`,
    error: null,
    ...overrides,
});
