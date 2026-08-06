import type { InferInsertModel } from 'drizzle-orm';
import type { advertiserAccount, campaign } from '@/db/schema';

export const campaignMutationAccountId = '00000000-0000-4000-8000-000000000101';
export const campaignMutationOtherAccountId = '00000000-0000-4000-8000-000000000102';

type AdvertiserAccountInsert = InferInsertModel<typeof advertiserAccount>;
type CampaignInsert = InferInsertModel<typeof campaign>;

export const buildCampaignMutationAccount = (overrides: Partial<AdvertiserAccountInsert> = {}): AdvertiserAccountInsert => ({
    id: campaignMutationAccountId,
    adsAccountId: 'campaign-mutation-ads-account',
    accountName: 'Campaign mutation advertiser',
    status: 'CREATED',
    countryCode: 'US',
    profileId: '1001',
    entityId: 'campaign-mutation-entity',
    enabled: true,
    ...overrides,
});

export const buildCampaignMutationArchiveRow = (overrides: Partial<CampaignInsert> = {}): CampaignInsert => ({
    id: 'campaign-archive-1',
    campaignId: 'campaign-existing-1',
    accountId: 'campaign-mutation-ads-account',
    countryCode: 'US',
    name: 'Existing campaign',
    adProduct: 'SPONSORED_PRODUCTS',
    state: 'PAUSED',
    deliveryStatus: 'NOT_DELIVERING',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    targetingSettings: 'MANUAL',
    bidStrategy: 'SALES_DOWN_ONLY',
    budgetType: 'MONETARY',
    budgetPeriod: 'DAILY',
    budgetAmount: '25.00',
    creationDateTime: new Date('2026-08-01T07:00:00.000Z'),
    lastUpdatedDateTime: new Date('2026-08-05T07:00:00.000Z'),
    ...overrides,
});

export const buildAmazonCampaignResponse = (overrides: Record<string, unknown> = {}) => ({
    campaignId: 'campaign-created-1',
    name: 'Created campaign',
    state: 'ENABLED',
    status: { deliveryStatus: 'DELIVERING' },
    startDateTime: '2026-08-10T07:00:00.000Z',
    endDateTime: '2026-08-13T06:59:59.999Z',
    budgets: [
        {
            budgetType: 'MONETARY',
            recurrenceTimePeriod: 'DAILY',
            budgetValue: {
                monetaryBudgetValue: {
                    monetaryBudget: { value: 25, currencyCode: 'USD' },
                },
            },
        },
    ],
    autoCreationSettings: { autoCreateTargets: false },
    optimizations: {
        bidSettings: {
            bidStrategy: 'SALES_DOWN_ONLY',
            bidAdjustments: {
                placementBidAdjustments: [
                    { placement: 'TOP_OF_SEARCH', percentage: 50 },
                    { placement: 'REST_OF_SEARCH', percentage: 10 },
                    { placement: 'PRODUCT_PAGE', percentage: 20 },
                    { placement: 'AMAZON_BUSINESS', percentage: 5 },
                ],
            },
        },
    },
    ...overrides,
});
