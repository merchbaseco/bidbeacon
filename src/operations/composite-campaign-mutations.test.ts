import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, campaign } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createSponsoredProductsCampaign } from './campaign-mutations';
import { createOperationContext } from './operation-context';
import {
    buildAmazonCompositeAdGroupResponse,
    buildAmazonCompositeAdResponse,
    buildAmazonCompositeAutoTargetResponse,
    buildAmazonCompositeCampaignResponse,
    buildAmazonCompositeKeywordTargetResponse,
    buildAmazonCompositeNegativeKeywordTargetResponse,
    buildAmazonCompositeNegativeProductTargetResponse,
    buildAmazonCompositeProductTargetResponse,
    buildCompositeCampaignAccount,
    compositeCampaignAccountId,
} from './testing/composite-campaign-fixtures';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';

const accountId = compositeCampaignAccountId;

vi.mock('@/db/index', () => ({ db: {} }));

describe('Sponsored Products composite campaign creation', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('creates a paused canonical topology in the documented order', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: {
                    success: [
                        {
                            campaign: {
                                campaignId: 'composite-campaign-1',
                                name: 'Composite campaign',
                                state: 'PAUSED',
                                status: { deliveryStatus: 'NOT_DELIVERING' },
                                startDateTime: '2026-08-06T04:00:00.000Z',
                                budgets: [{ budgetValue: { monetaryBudgetValue: { monetaryBudget: { value: 25, currencyCode: 'USD' } } } }],
                                autoCreationSettings: { autoCreateTargets: false },
                                optimizations: { bidSettings: { bidStrategy: 'SALES_DOWN_ONLY' } },
                            },
                        },
                    ],
                },
                createAdGroups: {
                    success: [
                        {
                            adGroup: {
                                adGroupId: 'composite-ad-group-1',
                                campaignId: 'composite-campaign-1',
                                name: 'Default',
                                state: 'ENABLED',
                                status: { deliveryStatus: 'DELIVERING' },
                                bid: { defaultBid: 0.35 },
                            },
                        },
                    ],
                },
                createAds: {
                    success: [
                        {
                            ad: {
                                adId: 'composite-ad-1',
                                campaignId: 'composite-campaign-1',
                                adGroupId: 'composite-ad-group-1',
                                state: 'ENABLED',
                                status: { deliveryStatus: 'DELIVERING' },
                                creative: { productCreative: { productCreativeSettings: { advertisedProduct: { productIdType: 'ASIN', productId: 'B000000001' } } } },
                            },
                        },
                    ],
                },
            },
            responseSequences: {
                createTargets: [
                    {
                        success: [
                            {
                                target: {
                                    targetId: 'composite-target-1',
                                    campaignId: 'composite-campaign-1',
                                    adGroupId: 'composite-ad-group-1',
                                    state: 'ENABLED',
                                    status: { deliveryStatus: 'DELIVERING' },
                                    negative: false,
                                    bid: { bid: 0.45 },
                                    targetType: 'KEYWORD',
                                    targetDetails: { keywordTarget: { keyword: 'funny cat shirt', matchType: 'EXACT' } },
                                },
                            },
                        ],
                    },
                    {
                        success: [
                            {
                                target: {
                                    targetId: 'composite-negative-target-1',
                                    campaignId: 'composite-campaign-1',
                                    adGroupId: 'composite-ad-group-1',
                                    state: 'ENABLED',
                                    status: { deliveryStatus: 'DELIVERING' },
                                    negative: true,
                                    targetType: 'KEYWORD',
                                    targetDetails: { keywordTarget: { keyword: 'free', matchType: 'PHRASE' } },
                                },
                            },
                        ],
                    },
                ],
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [accountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'composite-campaign-user',
            },
        });

        const result = await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: {
                name: 'Composite campaign',
                state: 'PAUSED',
                dailyBudget: 25,
                bidStrategy: 'DYNAMIC_DOWN_ONLY',
                startDate: '2026-08-06',
                placementBidAdjustments: { topOfSearch: 50 },
            },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: {
                mode: 'MANUAL_KEYWORD',
                keywords: [{ keyword: 'funny cat shirt', matchType: 'EXACT', bid: 0.45 }],
            },
            negatives: { keywords: [{ keyword: 'free', matchType: 'PHRASE' }] },
        });

        expect(amazonAds.calls.map(call => call.operation)).toEqual(['createCampaigns', 'createAdGroups', 'createAds', 'createTargets', 'createTargets']);
        expect(result).toMatchObject({
            campaign: {
                id: 'composite-campaign-1',
                state: 'PAUSED',
                dailyBudget: 25,
                bidStrategy: 'DYNAMIC_DOWN_ONLY',
                placementBidAdjustments: { topOfSearch: 50 },
            },
            adGroup: { id: 'composite-ad-group-1', campaignId: 'composite-campaign-1', state: 'ENABLED', defaultBid: 0.35 },
            ads: [{ id: 'composite-ad-1', asin: 'B000000001', state: 'ENABLED' }],
            targets: [
                { id: 'composite-target-1', type: 'KEYWORD', negative: false, bid: 0.45 },
                { id: 'composite-negative-target-1', type: 'KEYWORD', negative: true },
            ],
        });
        expect(amazonAds.calls.at(-1)?.input).toMatchObject({
            targets: [
                {
                    adGroupId: 'composite-ad-group-1',
                    negative: true,
                    state: 'ENABLED',
                },
            ],
        });
    });

    it.each([
        {
            label: 'duplicate advertised ASINs',
            input: {
                accountId,
                campaign: { name: 'Invalid', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001', 'b000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.4 }] },
            },
        },
        {
            label: 'duplicate target specifications',
            input: {
                accountId,
                campaign: { name: 'Invalid', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: {
                    mode: 'MANUAL_KEYWORD',
                    keywords: [
                        { keyword: 'shirt', matchType: 'EXACT', bid: 0.4 },
                        { keyword: ' Shirt ', matchType: 'EXACT', bid: 0.5 },
                    ],
                },
            },
        },
        {
            label: 'mixed targeting modes',
            input: {
                accountId,
                campaign: { name: 'Invalid', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: {
                    mode: 'MANUAL_KEYWORD',
                    keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.4 }],
                    products: [{ asin: 'B000000002', bid: 0.4 }],
                },
            },
        },
    ])('rejects $label before any Amazon write', async ({ input }) => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        await expect(createSponsoredProductsCampaign(context, input)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        expect(amazonAds.calls).toEqual([]);
    });

    it('defaults a missing Campaign start date in the Advertiser account timezone before writing', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: { name: 'Defaulted date', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY' },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.4 }] },
        });

        expect(amazonAds.calls[0]?.input).toMatchObject({
            campaigns: [{ startDateTime: '2026-08-06T07:00:00.000Z', state: 'PAUSED' }],
        });
    });

    it('assembles manual product targets without keyword or refinement fields', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse() }] },
                createAdGroups: { success: [{ adGroup: buildAmazonCompositeAdGroupResponse() }] },
                createAds: { success: [{ ad: buildAmazonCompositeAdResponse() }] },
            },
            responseSequences: {
                createTargets: [
                    {
                        success: [
                            {
                                target: buildAmazonCompositeProductTargetResponse({
                                    targetId: 'composite-product-target-1',
                                    targetDetails: { productTarget: { productIdType: 'ASIN', matchType: 'PRODUCT_EXACT', product: { productId: 'B000000002' } } },
                                }),
                            },
                        ],
                    },
                    {
                        success: [
                            {
                                target: buildAmazonCompositeProductTargetResponse({
                                    targetId: 'composite-product-target-2',
                                    targetDetails: { productTarget: { productIdType: 'ASIN', matchType: 'PRODUCT_EXACT', product: { productId: 'B000000003' } } },
                                }),
                            },
                        ],
                    },
                ],
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        const result = await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: { name: 'Manual products', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: {
                mode: 'MANUAL_PRODUCT',
                products: [
                    { asin: 'B000000002', bid: 0.4 },
                    { asin: 'B000000003', bid: 0.45 },
                ],
            },
        });

        expect(result.targets.map(target => target.asin)).toEqual(['B000000002', 'B000000003']);
        expect(amazonAds.calls.filter(call => call.operation === 'createTargets').map(call => call.input)).toEqual([
            expect.objectContaining({
                targets: [expect.objectContaining({ targetType: 'PRODUCT', targetDetails: { productTarget: expect.objectContaining({ product: { productId: 'B000000002' } }) } })],
            }),
            expect.objectContaining({
                targets: [expect.objectContaining({ targetType: 'PRODUCT', targetDetails: { productTarget: expect.objectContaining({ product: { productId: 'B000000003' } }) } })],
            }),
        ]);
    });

    it('assembles all four automatic targets and inherits the Ad group bid for omitted overrides', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const automaticMatchTypes = ['SEARCH_CLOSE_MATCH', 'SEARCH_LOOSE_MATCH', 'PRODUCT_SUBSTITUTES', 'PRODUCT_COMPLEMENTS'];
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse() }] },
                createAdGroups: { success: [{ adGroup: buildAmazonCompositeAdGroupResponse({ bid: { defaultBid: 0.35 } }) }] },
                createAds: { success: [{ ad: buildAmazonCompositeAdResponse() }] },
            },
            responseSequences: {
                createTargets: automaticMatchTypes.map((matchType, index) => ({
                    success: [
                        {
                            target: buildAmazonCompositeAutoTargetResponse({
                                targetId: `composite-auto-target-${index + 1}`,
                                bid: { bid: index === 1 ? 0.5 : 0.35 },
                                targetDetails: { autoTarget: { matchType } },
                            }),
                        },
                    ],
                })),
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        const result = await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: { name: 'Auto campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: { mode: 'AUTO', bidOverrides: { looseMatch: 0.5 } },
        });

        expect(result.targets).toHaveLength(4);
        expect(result.campaign.targetingMode).toBe('AUTO');
        expect(result.targets.map(target => target.matchType)).toEqual(automaticMatchTypes);
        expect(amazonAds.calls[0]?.input).toMatchObject({
            campaigns: [{ autoCreationSettings: { autoCreateTargets: false } }],
        });
        expect(
            amazonAds.calls
                .filter(call => call.operation === 'createTargets')
                .map(call => (call.input as { targets: Array<{ bid: { bid: number }; targetDetails: { autoTarget: { matchType: string } } }> }).targets[0])
        ).toEqual(
            automaticMatchTypes.map((matchType, index) => ({
                adProduct: 'SPONSORED_PRODUCTS',
                adGroupId: 'composite-ad-group-1',
                bid: { bid: index === 1 ? 0.5 : 0.35 },
                state: 'ENABLED',
                negative: false,
                targetType: 'AUTO',
                targetDetails: { autoTarget: { matchType } },
            }))
        );
    });

    it('applies the requested Campaign state only after every child succeeds', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse() }] },
                createAdGroups: { success: [{ adGroup: buildAmazonCompositeAdGroupResponse() }] },
                createAds: { success: [{ ad: buildAmazonCompositeAdResponse() }] },
                createTargets: { success: [{ target: buildAmazonCompositeKeywordTargetResponse() }] },
                updateCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse({ state: 'ENABLED', status: { deliveryStatus: 'DELIVERING' } }) }] },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        const result = await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: { name: 'Enabled campaign', state: 'ENABLED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
        });

        expect(amazonAds.calls.map(call => call.operation)).toEqual(['createCampaigns', 'createAdGroups', 'createAds', 'createTargets', 'updateCampaigns']);
        expect(amazonAds.calls[0]?.input).toMatchObject({ campaigns: [{ state: 'PAUSED' }] });
        expect(amazonAds.calls.at(-1)?.input).toEqual({ profileId: 4001, region: 'na', campaigns: [{ campaignId: 'composite-campaign-1', state: 'ENABLED' }] });
        expect(result.campaign.state).toBe('ENABLED');
    });

    it('creates both supported ad-group negative Target kinds in target order', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse() }] },
                createAdGroups: { success: [{ adGroup: buildAmazonCompositeAdGroupResponse() }] },
                createAds: { success: [{ ad: buildAmazonCompositeAdResponse() }] },
            },
            responseSequences: {
                createTargets: [
                    { success: [{ target: buildAmazonCompositeKeywordTargetResponse() }] },
                    { success: [{ target: buildAmazonCompositeNegativeKeywordTargetResponse() }] },
                    { success: [{ target: buildAmazonCompositeNegativeProductTargetResponse() }] },
                ],
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        const result = await createSponsoredProductsCampaign(context, {
            accountId,
            campaign: { name: 'Negative targets', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
            adGroup: { name: 'Default', defaultBid: 0.35 },
            asins: ['B000000001'],
            targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            negatives: { keywords: [{ keyword: 'free', matchType: 'PHRASE' }], asins: ['B000000003'] },
        });

        expect(result.targets.map(target => ({ type: target.type, negative: target.negative }))).toEqual([
            { type: 'KEYWORD', negative: false },
            { type: 'KEYWORD', negative: true },
            { type: 'PRODUCT', negative: true },
        ]);
        expect(amazonAds.calls.map(call => call.operation)).toEqual(['createCampaigns', 'createAdGroups', 'createAds', 'createTargets', 'createTargets', 'createTargets']);
    });

    it.each([
        {
            label: 'Campaign',
            failure: { operation: 'createAdGroups' as const, callNumber: 1 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            },
            failedOperation: 'create_ad_group',
            failedInput: { accountId, campaignId: 'composite-campaign-1', name: 'Default', state: 'ENABLED', defaultBid: 0.35 },
            created: { adGroups: [], ads: [], targets: [] },
        },
        {
            label: 'Ad group',
            failure: { operation: 'createAds' as const, callNumber: 1 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            },
            failedOperation: 'create_ad',
            failedInput: { accountId, adGroupId: 'composite-ad-group-1', asin: 'B000000001', state: 'ENABLED' },
            created: { adGroups: ['composite-ad-group-1'], ads: [], targets: [] },
        },
        {
            label: 'second Ad',
            failure: { operation: 'createAds' as const, callNumber: 2 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001', 'B000000002'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            },
            failedOperation: 'create_ad',
            failedInput: { accountId, adGroupId: 'composite-ad-group-1', asin: 'B000000002', state: 'ENABLED' },
            created: { adGroups: ['composite-ad-group-1'], ads: ['composite-ad-1'], targets: [] },
        },
        {
            label: 'positive Target',
            failure: { operation: 'createTargets' as const, callNumber: 1 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            },
            failedOperation: 'create_keyword_target',
            failedInput: { accountId, adGroupId: 'composite-ad-group-1', keyword: 'shirt', matchType: 'EXACT', bid: 0.45, state: 'ENABLED' },
            created: { adGroups: ['composite-ad-group-1'], ads: ['composite-ad-1'], targets: [] },
        },
        {
            label: 'negative Target',
            failure: { operation: 'createTargets' as const, callNumber: 2 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'PAUSED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
                negatives: { keywords: [{ keyword: 'free', matchType: 'PHRASE' }] },
            },
            failedOperation: 'create_negative_keyword',
            failedInput: {
                accountId,
                campaignId: 'composite-campaign-1',
                adGroupId: 'composite-ad-group-1',
                keyword: 'free',
                matchType: 'PHRASE',
                state: 'ENABLED',
            },
            created: { adGroups: ['composite-ad-group-1'], ads: ['composite-ad-1'], targets: ['composite-keyword-target-1'] },
        },
        {
            label: 'requested Campaign state',
            failure: { operation: 'updateCampaigns' as const, callNumber: 1 },
            input: {
                accountId,
                campaign: { name: 'Partial campaign', state: 'ENABLED', dailyBudget: 25, bidStrategy: 'DYNAMIC_DOWN_ONLY', startDate: '2026-08-06' },
                adGroup: { name: 'Default', defaultBid: 0.35 },
                asins: ['B000000001'],
                targeting: { mode: 'MANUAL_KEYWORD', keywords: [{ keyword: 'shirt', matchType: 'EXACT', bid: 0.45 }] },
            },
            failedOperation: 'update_campaign',
            failedInput: { accountId, campaignId: 'composite-campaign-1', changes: { state: 'ENABLED' } },
            created: { adGroups: ['composite-ad-group-1'], ads: ['composite-ad-1'], targets: ['composite-keyword-target-1'] },
        },
    ])('returns a structured partial failure after the $label step and stops', async testCase => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCompositeCampaignAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse() }] },
                createAdGroups: { success: [{ adGroup: buildAmazonCompositeAdGroupResponse() }] },
                createAds: { success: [{ ad: buildAmazonCompositeAdResponse() }] },
                createTargets: { success: [{ target: buildAmazonCompositeKeywordTargetResponse() }] },
                updateCampaigns: { success: [{ campaign: buildAmazonCompositeCampaignResponse({ state: 'ENABLED', status: { deliveryStatus: 'DELIVERING' } }) }] },
            },
            failure: { ...testCase.failure, message: 'Amazon rejected this request with Bearer super-secret-token' },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'composite-campaign-user' },
        });

        const rejection = createSponsoredProductsCampaign(context, testCase.input);
        await expect(rejection).rejects.toMatchObject({
            code: 'COMPOSITE_PARTIAL_FAILURE',
            details: {
                campaign: { id: 'composite-campaign-1', state: 'PAUSED' },
                created: {
                    adGroups: testCase.created.adGroups.map(id => expect.objectContaining({ id })),
                    ads: testCase.created.ads.map(id => expect.objectContaining({ id })),
                    targets: testCase.created.targets.map(id => expect.objectContaining({ id })),
                },
                failed: {
                    operation: testCase.failedOperation,
                    input: testCase.failedInput,
                    amazon: { message: 'Amazon rejected this request with Bearer [redacted]' },
                },
            },
        });
        const [storedCampaign] = await database.db.select({ state: campaign.state }).from(campaign);
        expect(storedCampaign?.state).toBe('PAUSED');
        expect(amazonAds.calls.at(-1)?.operation).toBe(testCase.failure.operation);
    });
});
