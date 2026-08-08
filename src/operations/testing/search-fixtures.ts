import type { InferInsertModel } from 'drizzle-orm';
import type { advertiserAccount, campaign, performanceDaily, reportDatasetMetadata, target } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type PerformanceDailyInsert = InferInsertModel<typeof performanceDaily>;
type ReportDatasetMetadataInsert = InferInsertModel<typeof reportDatasetMetadata>;
type TargetInsert = InferInsertModel<typeof target>;

export const SEARCH_ACCOUNT_ID = '00000000-0000-4000-8000-000000000101';
export const SEARCH_OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000102';

export const buildSearchAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: SEARCH_ACCOUNT_ID,
    adsAccountId: 'search-ads-account-1',
    accountName: 'Search advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'search-profile-1',
    entityId: 'search-entity-1',
    enabled: true,
    ...overrides,
});

export const buildSearchCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'search-campaign-row-1',
    campaignId: 'campaign-search-1',
    accountId: 'search-ads-account-1',
    countryCode: 'US',
    name: 'Alpha campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    startDate: '2026-08-01',
    endDate: null,
    targetingSettings: 'MANUAL_KEYWORD',
    bidStrategy: 'SALES_DOWN_ONLY',
    budgetType: 'DAILY',
    budgetPeriod: 'DAILY',
    budgetAmount: '25.00',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchPerformanceDaily = (overrides: Partial<PerformanceDailyInsert> = {}): PerformanceDailyInsert => ({
    accountId: 'search-ads-account-1',
    bucketStart: new Date('2026-08-06T07:00:00.000Z'),
    bucketDate: '2026-08-06',
    campaignId: 'campaign-search-1',
    adGroupId: 'search-ad-group-1',
    adId: 'search-ad-1',
    entityType: 'target',
    entityId: 'search-target-1',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '10.00',
    sales: '40.00',
    purchases: 2,
    ...overrides,
});

export const buildSearchTarget = (overrides: Partial<TargetInsert> = {}): TargetInsert => ({
    id: 'search-target-row-1',
    campaignId: 'campaign-search-1',
    targetId: 'search-target-1',
    adGroupId: 'search-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    negative: false,
    bidAmount: '1.10',
    targetMatchType: 'EXACT',
    targetAsin: null,
    targetKeyword: 'shirt',
    targetType: 'KEYWORD',
    deliveryStatus: 'DELIVERING',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildSearchReportMetadata = (date: string, overrides: Partial<ReportDatasetMetadataInsert> = {}): ReportDatasetMetadataInsert => ({
    accountId: 'search-ads-account-1',
    countryCode: 'US',
    periodStart: localMidnight(date),
    aggregation: 'daily',
    entityType: 'target',
    status: 'completed',
    refreshing: false,
    totalRecords: 1,
    successRecords: 1,
    errorRecords: 0,
    nextRefreshAt: null,
    lastReportCreatedAt: new Date(`${date}T08:00:00.000Z`),
    reportId: `search-report-${date}`,
    lastProcessedReportId: `search-report-${date}`,
    error: null,
    ...overrides,
});

const localMidnight = (date: string) => new Date(`${date}T07:00:00.000Z`);
