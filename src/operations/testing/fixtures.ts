import type { InferInsertModel } from 'drizzle-orm';
import type { ad, adGroup, advertiserAccount, campaign, entityChangeHistory, performanceDaily, performanceHourly, reportDatasetMetadata, target, userAccountAccess } from '@/db/schema';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type UserAccountAccessInsert = InferInsertModel<typeof userAccountAccess>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type AdInsert = InferInsertModel<typeof ad>;
type TargetInsert = InferInsertModel<typeof target>;
type PerformanceHourlyInsert = InferInsertModel<typeof performanceHourly>;
type PerformanceDailyInsert = InferInsertModel<typeof performanceDaily>;
type ReportDatasetMetadataInsert = InferInsertModel<typeof reportDatasetMetadata>;
type EntityChangeHistoryInsert = InferInsertModel<typeof entityChangeHistory>;

export const buildAdvertiserAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: '00000000-0000-4000-8000-000000000001',
    adsAccountId: 'ads-account-1',
    accountName: 'Test advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: 'profile-1',
    entityId: 'entity-1',
    enabled: true,
    ...overrides,
});

export const buildUserAccountAccess = (overrides: Partial<UserAccountAccessInsert> = {}): UserAccountAccessInsert => ({
    merchbaseUserId: 'user-1',
    adsAccountId: 'ads-account-1',
    advertiserAccountId: '00000000-0000-4000-8000-000000000001',
    ...overrides,
});

export const buildCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'campaign-row-1',
    campaignId: 'campaign-1',
    accountId: 'ads-account-1',
    countryCode: 'US',
    name: 'Test campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    startDate: '2026-08-01',
    endDate: null,
    targetingSettings: 'MANUAL',
    bidStrategy: 'LEGACY_FOR_SALES',
    budgetType: 'DAILY',
    budgetPeriod: 'DAILY',
    budgetAmount: '25.00',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'ad-group-row-1',
    adGroupId: 'ad-group-1',
    campaignId: 'campaign-1',
    name: 'Test ad group',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    bidAmount: '1.25',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildAd = (overrides: Partial<AdInsert> = {}): AdInsert => ({
    id: 'ad-row-1',
    adId: 'ad-1',
    adGroupId: 'ad-group-1',
    campaignId: 'campaign-1',
    adProduct: 'SPONSORED_PRODUCTS',
    adType: 'PRODUCT_AD',
    state: 'ENABLED',
    deliveryStatus: 'DELIVERING',
    productAsin: 'asin-1',
    productTitle: 'Test product',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildTarget = (overrides: Partial<TargetInsert> = {}): TargetInsert => ({
    id: 'target-row-1',
    campaignId: 'campaign-1',
    targetId: 'target-1',
    adGroupId: 'ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    negative: false,
    bidAmount: '1.10',
    targetMatchType: 'EXACT',
    targetAsin: 'asin-1',
    targetKeyword: null,
    targetType: 'TARGETING_EXPRESSION',
    deliveryStatus: 'DELIVERING',
    creationDateTime: new Date('2026-08-01T12:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T12:00:00.000Z'),
    ...overrides,
});

export const buildPerformanceHourly = (overrides: Partial<PerformanceHourlyInsert> = {}): PerformanceHourlyInsert => ({
    accountId: 'ads-account-1',
    bucketStart: new Date('2026-08-05T07:00:00.000Z'),
    bucketDate: '2026-08-05',
    bucketHour: 3,
    campaignId: 'campaign-1',
    adGroupId: 'ad-group-1',
    adId: 'ad-1',
    entityType: 'target',
    entityId: 'target-1',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '12.50',
    sales: '50.00',
    purchases: 2,
    ...overrides,
});

export const buildPerformanceDaily = (overrides: Partial<PerformanceDailyInsert> = {}): PerformanceDailyInsert => ({
    accountId: 'ads-account-1',
    bucketStart: new Date('2026-08-05T07:00:00.000Z'),
    bucketDate: '2026-08-05',
    campaignId: 'campaign-1',
    adGroupId: 'ad-group-1',
    adId: 'ad-1',
    entityType: 'asin',
    entityId: 'asin-1',
    targetMatchType: null,
    impressions: 100,
    clicks: 10,
    spend: '12.50',
    sales: '50.00',
    purchases: 2,
    ...overrides,
});

export const buildReportDatasetMetadata = (overrides: Partial<ReportDatasetMetadataInsert> = {}): ReportDatasetMetadataInsert => ({
    accountId: 'ads-account-1',
    countryCode: 'US',
    periodStart: new Date('2026-08-05T00:00:00.000Z'),
    aggregation: 'daily',
    entityType: 'target',
    status: 'completed',
    refreshing: false,
    totalRecords: 1,
    successRecords: 1,
    errorRecords: 0,
    nextRefreshAt: null,
    lastReportCreatedAt: new Date('2026-08-06T00:00:00.000Z'),
    reportId: 'report-1',
    lastProcessedReportId: 'report-1',
    error: null,
    ...overrides,
});

export const buildEntityChangeHistory = (overrides: Partial<EntityChangeHistoryInsert> = {}): EntityChangeHistoryInsert => ({
    accountId: 'ads-account-1',
    countryCode: 'US',
    localDate: '2026-08-05',
    entityType: 'campaign',
    entityId: 'campaign-1',
    eventType: 'state_change',
    fieldName: 'state',
    previousValue: 'PAUSED',
    newValue: 'ENABLED',
    changedAt: new Date('2026-08-05T15:00:00.000Z'),
    source: 'change_history',
    rawPayload: { campaignId: 'campaign-1' },
    ...overrides,
});
