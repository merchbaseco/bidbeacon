import type { InferInsertModel } from 'drizzle-orm';
import type { adGroup, advertiserAccount, campaign, target } from '@/db/schema';

export const targetMutationAccountId = '00000000-0000-4000-8000-000000000301';
export const targetMutationOtherAccountId = '00000000-0000-4000-8000-000000000302';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type TargetInsert = InferInsertModel<typeof target>;

export const buildTargetMutationAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: targetMutationAccountId,
    adsAccountId: 'target-mutation-ads-account',
    accountName: 'Target mutation advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: '3001',
    entityId: 'target-mutation-entity',
    enabled: true,
    ...overrides,
});

export const buildTargetMutationCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'target-mutation-campaign-row-1',
    campaignId: 'target-mutation-campaign-1',
    accountId: 'target-mutation-ads-account',
    countryCode: 'US',
    name: 'Target mutation campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    deliveryStatus: 'NOT_DELIVERING',
    startDate: '2026-08-01',
    endDate: null,
    targetingSettings: 'MANUAL',
    bidStrategy: 'SALES_DOWN_ONLY',
    budgetType: 'MONETARY',
    budgetPeriod: 'DAILY',
    budgetAmount: '25.00',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildTargetMutationAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'target-mutation-ad-group-row-1',
    adGroupId: 'target-mutation-ad-group-1',
    campaignId: 'target-mutation-campaign-1',
    name: 'Target mutation ad group',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    deliveryStatus: 'NOT_DELIVERING',
    bidAmount: '0.25',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildTargetMutationTarget = (overrides: Partial<TargetInsert> = {}): TargetInsert => ({
    id: 'target-mutation-target-row-1',
    campaignId: 'target-mutation-campaign-1',
    targetId: 'target-mutation-target-1',
    adGroupId: 'target-mutation-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    negative: false,
    bidAmount: '0.40',
    targetMatchType: 'EXACT',
    targetAsin: null,
    targetKeyword: 'existing keyword',
    targetType: 'KEYWORD',
    deliveryStatus: 'NOT_DELIVERING',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildAmazonKeywordTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'target-mutation-keyword-created-1',
    campaignId: 'target-mutation-campaign-1',
    adGroupId: 'target-mutation-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: false,
    bid: { bid: 0.45 },
    targetType: 'KEYWORD',
    targetDetails: {
        keywordTarget: {
            keyword: 'funny cat shirt',
            matchType: 'BROAD',
        },
    },
    ...overrides,
});

export const buildAmazonProductTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'target-mutation-product-created-1',
    campaignId: 'target-mutation-campaign-1',
    adGroupId: 'target-mutation-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    status: { deliveryStatus: 'NOT_DELIVERING' },
    negative: false,
    bid: { bid: 0.4 },
    targetType: 'PRODUCT',
    targetDetails: {
        productTarget: {
            productIdType: 'ASIN',
            matchType: 'PRODUCT_EXACT',
            product: { productId: 'B000000001' },
        },
    },
    ...overrides,
});

export const buildAmazonNegativeKeywordTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'target-mutation-negative-keyword-created-1',
    campaignId: 'target-mutation-campaign-1',
    adGroupId: 'target-mutation-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: true,
    targetType: 'KEYWORD',
    targetDetails: {
        keywordTarget: {
            keyword: 'free',
            matchType: 'PHRASE',
        },
    },
    ...overrides,
});

export const buildAmazonNegativeProductTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'target-mutation-negative-product-created-1',
    campaignId: 'target-mutation-campaign-1',
    adGroupId: 'target-mutation-ad-group-1',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    status: { deliveryStatus: 'NOT_DELIVERING' },
    negative: true,
    targetType: 'PRODUCT',
    targetDetails: {
        productTarget: {
            productIdType: 'ASIN',
            matchType: 'PRODUCT_EXACT',
            product: { productId: 'B000000002' },
        },
    },
    ...overrides,
});
