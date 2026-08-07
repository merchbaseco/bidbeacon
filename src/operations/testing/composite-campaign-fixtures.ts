import type { InferInsertModel } from 'drizzle-orm';
import type { advertiserAccount } from '@/db/schema';

export const compositeCampaignAccountId = '00000000-0000-4000-8000-000000000401';
export const compositeCampaignOtherAccountId = '00000000-0000-4000-8000-000000000402';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;

export const buildCompositeCampaignAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: compositeCampaignAccountId,
    adsAccountId: 'composite-campaign-ads-account',
    accountName: 'Composite campaign advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: '4001',
    entityId: 'composite-campaign-entity',
    enabled: true,
    ...overrides,
});

export const buildAmazonCompositeCampaignResponse = (overrides: Record<string, unknown> = {}) => ({
    campaignId: 'composite-campaign-1',
    name: 'Composite campaign',
    state: 'PAUSED',
    status: { deliveryStatus: 'NOT_DELIVERING' },
    startDateTime: '2026-08-06T04:00:00.000Z',
    budgets: [{ budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 25, currencyCode: 'USD' } } } }],
    autoCreationSettings: { autoCreateTargets: false },
    optimizations: { bidSettings: { bidStrategy: 'SALES_DOWN_ONLY' } },
    ...overrides,
});

export const buildAmazonCompositeAdGroupResponse = (overrides: Record<string, unknown> = {}) => ({
    adGroupId: 'composite-ad-group-1',
    campaignId: 'composite-campaign-1',
    name: 'Default',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    bid: { defaultBid: 0.35 },
    ...overrides,
});

export const buildAmazonCompositeAdResponse = (overrides: Record<string, unknown> = {}) => ({
    adId: 'composite-ad-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    creative: { productCreative: { productCreativeSettings: { advertisedProduct: { productIdType: 'ASIN', productId: 'B000000001' } } } },
    ...overrides,
});

export const buildAmazonCompositeKeywordTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'composite-keyword-target-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: false,
    bid: { bid: 0.45 },
    targetType: 'KEYWORD',
    targetDetails: { keywordTarget: { keyword: 'funny cat shirt', matchType: 'EXACT' } },
    ...overrides,
});

export const buildAmazonCompositeProductTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'composite-product-target-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: false,
    bid: { bid: 0.4 },
    targetType: 'PRODUCT',
    targetDetails: { productTarget: { productIdType: 'ASIN', matchType: 'PRODUCT_EXACT', product: { productId: 'B000000002' } } },
    ...overrides,
});

export const buildAmazonCompositeAutoTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'composite-auto-target-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: false,
    bid: { bid: 0.35 },
    targetType: 'AUTO',
    targetDetails: { autoTarget: { matchType: 'SEARCH_CLOSE_MATCH' } },
    ...overrides,
});

export const buildAmazonCompositeNegativeKeywordTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'composite-negative-keyword-target-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: true,
    targetType: 'KEYWORD',
    targetDetails: { keywordTarget: { keyword: 'free', matchType: 'PHRASE' } },
    ...overrides,
});

export const buildAmazonCompositeNegativeProductTargetResponse = (overrides: Record<string, unknown> = {}) => ({
    targetId: 'composite-negative-product-target-1',
    campaignId: 'composite-campaign-1',
    adGroupId: 'composite-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    negative: true,
    targetType: 'PRODUCT',
    targetDetails: { productTarget: { productIdType: 'ASIN', matchType: 'PRODUCT_EXACT', product: { productId: 'B000000003' } } },
    ...overrides,
});
