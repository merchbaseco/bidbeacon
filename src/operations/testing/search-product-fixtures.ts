import type { InferInsertModel } from 'drizzle-orm';
import type { ad, adGroup, advertiserAccount, campaign, performanceDaily, performanceHourly, reportDatasetMetadata } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type AdInsert = InferInsertModel<typeof ad>;
type PerformanceDailyInsert = InferInsertModel<typeof performanceDaily>;
type PerformanceHourlyInsert = InferInsertModel<typeof performanceHourly>;
type ReportDatasetMetadataInsert = InferInsertModel<typeof reportDatasetMetadata>;

export const SEARCH_PRODUCTS_ACCOUNT_ID = '00000000-0000-4000-8000-000000000301';
export const SEARCH_PRODUCTS_OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000302';

export const buildSearchProductAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: SEARCH_PRODUCTS_ACCOUNT_ID,
    adsAccountId: 'search-products-ads-account-1',
    accountName: 'Search Product advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'search-products-profile-1',
    entityId: 'search-products-entity-1',
    enabled: true,
    ...overrides,
});

export const buildSearchProductCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'search-products-campaign-row-1',
    campaignId: 'search-products-campaign-1',
    accountId: 'search-products-ads-account-1',
    countryCode: 'US',
    name: 'Search Product campaign one',
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

export const buildSearchProductAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'search-products-ad-group-row-1',
    adGroupId: 'search-products-ad-group-1',
    campaignId: 'search-products-campaign-1',
    name: 'Search Product ad group one',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    bidAmount: '0.75',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchProductAd = (overrides: Partial<AdInsert> = {}): AdInsert => ({
    id: 'search-products-ad-row-1',
    adId: 'search-products-ad-1',
    adGroupId: 'search-products-ad-group-1',
    campaignId: 'search-products-campaign-1',
    adProduct: 'SPONSORED_PRODUCTS',
    adType: 'PRODUCT_AD',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    productAsin: 'B0PRODUCT001',
    productTitle: 'Blue product',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchProductPerformanceDaily = (overrides: Partial<PerformanceDailyInsert> = {}): PerformanceDailyInsert => ({
    accountId: 'search-products-ads-account-1',
    bucketStart: new Date('2026-08-06T07:00:00.000Z'),
    bucketDate: '2026-08-06',
    campaignId: 'search-products-campaign-1',
    adGroupId: 'search-products-ad-group-1',
    adId: 'search-products-ad-1',
    entityType: 'product',
    entityId: 'B0PRODUCT001',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchProductPerformanceHourly = (overrides: Partial<PerformanceHourlyInsert> = {}): PerformanceHourlyInsert => ({
    accountId: 'search-products-ads-account-1',
    bucketStart: new Date('2026-08-06T10:00:00.000Z'),
    bucketDate: '2026-08-06',
    bucketHour: 3,
    campaignId: 'search-products-campaign-1',
    adGroupId: 'search-products-ad-group-1',
    adId: 'search-products-ad-1',
    entityType: 'product',
    entityId: 'B0PRODUCT001',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchProductReportMetadata = (date: string, overrides: Partial<ReportDatasetMetadataInsert> = {}): ReportDatasetMetadataInsert => ({
    accountId: 'search-products-ads-account-1',
    countryCode: 'US',
    periodStart: new Date(`${date}T07:00:00.000Z`),
    aggregation: 'daily',
    entityType: 'product',
    status: 'completed',
    refreshing: false,
    totalRecords: 1,
    successRecords: 1,
    errorRecords: 0,
    nextRefreshAt: null,
    lastReportCreatedAt: new Date(`${date}T08:00:00.000Z`),
    reportId: `search-products-report-${date}`,
    lastProcessedReportId: `search-products-report-${date}`,
    error: null,
    ...overrides,
});
