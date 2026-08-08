import type { InferInsertModel } from 'drizzle-orm';
import type { ad, adGroup, advertiserAccount, campaign } from '@/db/schema';

export const adMutationAccountId = '00000000-0000-4000-8000-000000000201';
export const adMutationOtherAccountId = '00000000-0000-4000-8000-000000000202';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;
type AdGroupInsert = InferInsertModel<typeof adGroup>;
type AdInsert = InferInsertModel<typeof ad>;

export const buildAdMutationAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: adMutationAccountId,
    adsAccountId: 'ad-mutation-ads-account',
    accountName: 'Ad mutation advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: '2001',
    entityId: 'ad-mutation-entity',
    enabled: true,
    ...overrides,
});

export const buildAdMutationCampaign = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'ad-mutation-campaign-row-1',
    campaignId: 'ad-mutation-campaign-1',
    accountId: 'ad-mutation-ads-account',
    countryCode: 'US',
    name: 'Ad mutation campaign',
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

export const buildAdMutationAdGroup = (overrides: Partial<AdGroupInsert> = {}): AdGroupInsert => ({
    id: 'ad-mutation-ad-group-row-1',
    adGroupId: 'ad-mutation-ad-group-1',
    campaignId: 'ad-mutation-campaign-1',
    name: 'Existing ad group',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    deliveryStatus: 'NOT_DELIVERING',
    bidAmount: '0.25',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildAdMutationAd = (overrides: Partial<AdInsert> = {}): AdInsert => ({
    id: 'ad-mutation-ad-row-1',
    adId: 'ad-mutation-ad-1',
    adGroupId: 'ad-mutation-ad-group-1',
    campaignId: 'ad-mutation-campaign-1',
    adProduct: 'SPONSORED_PRODUCTS',
    adType: 'PRODUCT_AD',
    state: 'PAUSED',
    deliveryStatus: 'NOT_DELIVERING',
    productAsin: 'B000000001',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildAmazonAdGroupResponse = (overrides: Record<string, unknown> = {}) => ({
    adGroupId: 'ad-mutation-ad-group-created-1',
    campaignId: 'ad-mutation-campaign-1',
    name: 'Created ad group',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    bid: { defaultBid: 0.35 },
    ...overrides,
});

export const buildAmazonAdResponse = (overrides: Record<string, unknown> = {}) => ({
    adId: 'ad-mutation-ad-created-1',
    campaignId: 'ad-mutation-campaign-1',
    adGroupId: 'ad-mutation-ad-group-1',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    adType: 'PRODUCT_AD',
    creative: {
        productCreative: {
            productCreativeSettings: {
                advertisedProduct: {
                    productIdType: 'ASIN',
                    productId: 'B000000001',
                    title: 'Created product',
                },
            },
        },
    },
    ...overrides,
});
