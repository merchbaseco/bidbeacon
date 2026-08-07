import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adGroup, advertiserAccount, campaign, entityChangeHistory, target } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext } from './operation-context';
import { createKeywordTarget, createNegativeKeyword, createNegativeProductTarget, createProductTarget, updateTarget } from './target-mutations';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildAmazonKeywordTargetResponse,
    buildAmazonNegativeKeywordTargetResponse,
    buildAmazonNegativeProductTargetResponse,
    buildAmazonProductTargetResponse,
    buildTargetMutationAccount,
    buildTargetMutationAdGroup,
    buildTargetMutationCampaign,
    buildTargetMutationTarget,
    targetMutationAccountId,
    targetMutationOtherAccountId,
} from './testing/target-mutation-fixtures';

vi.mock('@/db/index', () => ({ db: {} }));

describe('Target mutation operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('creates a positive keyword Target with the exact Sponsored Products payload, reconciles it, and records Change events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createTargets: { success: [{ target: buildAmazonKeywordTargetResponse() }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await createKeywordTarget(context, {
            accountId: targetMutationAccountId,
            adGroupId: 'target-mutation-ad-group-1',
            keyword: 'funny cat shirt',
            matchType: 'BROAD',
            bid: 0.45,
            state: 'ENABLED',
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createTargets',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            adGroupId: 'target-mutation-ad-group-1',
                            bid: { bid: 0.45 },
                            state: 'ENABLED',
                            negative: false,
                            targetType: 'KEYWORD',
                            targetDetails: {
                                keywordTarget: {
                                    keyword: 'funny cat shirt',
                                    matchType: 'BROAD',
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-keyword-created-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            type: 'KEYWORD',
            negative: false,
            matchType: 'BROAD',
            keyword: 'funny cat shirt',
            bid: 0.45,
        });

        await expect(database.db.select().from(target)).resolves.toMatchObject([
            {
                id: 'target-mutation-keyword-created-1',
                targetId: 'target-mutation-keyword-created-1',
                campaignId: 'target-mutation-campaign-1',
                adGroupId: 'target-mutation-ad-group-1',
                state: 'ENABLED',
                negative: false,
                bidAmount: '0.45',
                targetMatchType: 'BROAD',
                targetKeyword: 'funny cat shirt',
                targetType: 'KEYWORD',
                deliveryStatus: 'DELIVERING',
            },
        ]);

        const changes = await database.db
            .select({
                eventType: entityChangeHistory.eventType,
                fieldName: entityChangeHistory.fieldName,
                previousValue: entityChangeHistory.previousValue,
                newValue: entityChangeHistory.newValue,
                source: entityChangeHistory.source,
            })
            .from(entityChangeHistory)
            .where(eq(entityChangeHistory.entityId, 'target-mutation-keyword-created-1'))
            .orderBy(asc(entityChangeHistory.fieldName));
        expect(changes).toEqual([
            { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: '0.45', source: 'bidbeacon' },
            { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: 'ENABLED', source: 'bidbeacon' },
        ]);
    });

    it('creates an individual positive ASIN Target with PRODUCT_EXACT mapping and no refinement expression', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createTargets: { success: [{ target: buildAmazonProductTargetResponse() }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await createProductTarget(context, {
            accountId: targetMutationAccountId,
            adGroupId: 'target-mutation-ad-group-1',
            asin: 'b000000001',
            bid: 0.4,
            state: 'PAUSED',
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createTargets',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            adGroupId: 'target-mutation-ad-group-1',
                            bid: { bid: 0.4 },
                            state: 'PAUSED',
                            negative: false,
                            targetType: 'PRODUCT',
                            targetDetails: {
                                productTarget: {
                                    productIdType: 'ASIN',
                                    matchType: 'PRODUCT_EXACT',
                                    product: { productId: 'B000000001' },
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-product-created-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            state: 'PAUSED',
            deliveryStatus: 'NOT_DELIVERING',
            type: 'PRODUCT',
            negative: false,
            matchType: 'PRODUCT_EXACT',
            asin: 'B000000001',
            bid: 0.4,
        });
    });

    it('reconciles a Target returned in Amazon partialSuccess', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createTargets: {
                    partialSuccess: [{ target: buildAmazonKeywordTargetResponse({ targetId: 'target-mutation-partial-1' }) }],
                },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await createKeywordTarget(context, {
            accountId: targetMutationAccountId,
            adGroupId: 'target-mutation-ad-group-1',
            keyword: 'funny cat shirt',
            matchType: 'BROAD',
            bid: 0.45,
            state: 'ENABLED',
        });

        expect(result.id).toBe('target-mutation-partial-1');
        await expect(database.db.select({ targetId: target.targetId }).from(target)).resolves.toEqual([{ targetId: 'target-mutation-partial-1' }]);
    });

    it.each(['PHRASE', 'EXACT'] as const)('creates an ad-group negative %s keyword with explicit ancestry and without a bid', async matchType => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createTargets: {
                    success: [
                        {
                            target: buildAmazonNegativeKeywordTargetResponse({
                                targetDetails: { keywordTarget: { keyword: 'free', matchType } },
                            }),
                        },
                    ],
                },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await createNegativeKeyword(context, {
            accountId: targetMutationAccountId,
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            keyword: 'free',
            matchType,
            state: 'ENABLED',
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createTargets',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            adGroupId: 'target-mutation-ad-group-1',
                            state: 'ENABLED',
                            negative: true,
                            targetType: 'KEYWORD',
                            targetDetails: {
                                keywordTarget: {
                                    keyword: 'free',
                                    matchType,
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-negative-keyword-created-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            type: 'KEYWORD',
            negative: true,
            matchType,
            keyword: 'free',
        });
    });

    it.each(['PHRASE', 'EXACT'] as const)('accepts a %s positive keyword match type', async matchType => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createTargets: {
                    success: [
                        {
                            target: buildAmazonKeywordTargetResponse({
                                targetId: `target-mutation-${matchType.toLowerCase()}-keyword-1`,
                                targetDetails: { keywordTarget: { keyword: 'funny cat shirt', matchType } },
                            }),
                        },
                    ],
                },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        await createKeywordTarget(context, {
            accountId: targetMutationAccountId,
            adGroupId: 'target-mutation-ad-group-1',
            keyword: 'funny cat shirt',
            matchType,
            bid: 0.45,
            state: 'ENABLED',
        });

        expect(amazonAds.calls[0]).toMatchObject({
            operation: 'createTargets',
            input: {
                targets: [
                    expect.objectContaining({
                        targetDetails: { keywordTarget: { keyword: 'funny cat shirt', matchType } },
                    }),
                ],
            },
        });
    });

    it('creates an ad-group negative individual ASIN Target with no bid or category refinement', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createTargets: { success: [{ target: buildAmazonNegativeProductTargetResponse() }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await createNegativeProductTarget(context, {
            accountId: targetMutationAccountId,
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            asin: 'b000000002',
            state: 'PAUSED',
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createTargets',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            adGroupId: 'target-mutation-ad-group-1',
                            state: 'PAUSED',
                            negative: true,
                            targetType: 'PRODUCT',
                            targetDetails: {
                                productTarget: {
                                    productIdType: 'ASIN',
                                    matchType: 'PRODUCT_EXACT',
                                    product: { productId: 'B000000002' },
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-negative-product-created-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            state: 'PAUSED',
            deliveryStatus: 'NOT_DELIVERING',
            type: 'PRODUCT',
            negative: true,
            matchType: 'PRODUCT_EXACT',
            asin: 'B000000002',
        });
    });

    it('updates a positive Target with absolute state and bid controls, reconciles the accepted result, and records only changed fields', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());
        await database.db.insert(target).values(buildTargetMutationTarget());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                updateTargets: {
                    success: [
                        {
                            target: buildAmazonKeywordTargetResponse({
                                targetId: 'target-mutation-target-1',
                                state: 'ENABLED',
                                status: { deliveryStatus: 'DELIVERING' },
                                bid: { bid: 0.55 },
                                targetDetails: { keywordTarget: { keyword: 'existing keyword', matchType: 'EXACT' } },
                            }),
                        },
                    ],
                },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await updateTarget(context, {
            accountId: targetMutationAccountId,
            targetId: 'target-mutation-target-1',
            changes: { state: 'ENABLED', bid: 0.55 },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'updateTargets',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [{ targetId: 'target-mutation-target-1', state: 'ENABLED', bid: { bid: 0.55 } }],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-target-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: 'target-mutation-ad-group-1',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            type: 'KEYWORD',
            negative: false,
            matchType: 'EXACT',
            keyword: 'existing keyword',
            bid: 0.55,
        });

        await expect(database.db.select().from(target)).resolves.toMatchObject([
            {
                targetId: 'target-mutation-target-1',
                state: 'ENABLED',
                deliveryStatus: 'DELIVERING',
                bidAmount: '0.55',
            },
        ]);
        await expect(
            database.db
                .select({
                    eventType: entityChangeHistory.eventType,
                    fieldName: entityChangeHistory.fieldName,
                    previousValue: entityChangeHistory.previousValue,
                    newValue: entityChangeHistory.newValue,
                })
                .from(entityChangeHistory)
                .where(eq(entityChangeHistory.entityId, 'target-mutation-target-1'))
                .orderBy(asc(entityChangeHistory.fieldName))
        ).resolves.toEqual([
            { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: '0.4', newValue: '0.55' },
            { eventType: 'state_change', fieldName: 'state', previousValue: 'PAUSED', newValue: 'ENABLED' },
        ]);
    });

    it.each([
        {
            label: 'positive keyword',
            operation: 'deleteKeywords',
            overrides: {},
        },
        {
            label: 'positive Product target',
            operation: 'deleteTargets',
            overrides: { targetType: 'PRODUCT', targetAsin: 'B000000001', targetKeyword: null },
        },
        {
            label: 'negative keyword',
            operation: 'deleteNegativeKeywords',
            overrides: { negative: true, bidAmount: null },
        },
        {
            label: 'negative Product target',
            operation: 'deleteNegativeTargets',
            overrides: { targetType: 'PRODUCT', targetAsin: 'B000000002', targetKeyword: null, negative: true, bidAmount: null },
        },
        {
            label: 'Campaign negative Product target',
            operation: 'deleteCampaignNegativeTargets',
            overrides: { adGroupId: null, targetType: 'PRODUCT', targetAsin: 'B000000003', targetKeyword: null, negative: true, bidAmount: null },
        },
    ] as const)('archives a $label through its Amazon delete endpoint', async ({ operation, overrides }) => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());
        await database.db.insert(target).values(buildTargetMutationTarget(overrides));
        const amazonAds = createFakeAmazonAdsGateway({
            responses: { [operation]: { success: [{ targetId: 'target-mutation-target-1' }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await updateTarget(context, {
            accountId: targetMutationAccountId,
            targetId: 'target-mutation-target-1',
            changes: { state: 'ARCHIVED' },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation,
                input: { profileId: 3001, region: 'na', targets: [{ targetId: 'target-mutation-target-1' }] },
            },
        ]);
        expect(result).toMatchObject({ id: 'target-mutation-target-1', state: 'ARCHIVED', deliveryStatus: 'NOT_DELIVERING' });
    });

    it('archives an existing campaign-level negative by Target ID without allowing creation semantics', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(target).values(
            buildTargetMutationTarget({
                id: 'target-mutation-campaign-negative-row-1',
                targetId: 'target-mutation-campaign-negative-1',
                adGroupId: null,
                negative: true,
                bidAmount: null,
                targetMatchType: 'EXACT',
                targetKeyword: 'free',
            })
        );

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                deleteCampaignNegativeKeywords: { success: [{ targetId: 'target-mutation-campaign-negative-1' }] },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        const result = await updateTarget(context, {
            accountId: targetMutationAccountId,
            targetId: 'target-mutation-campaign-negative-1',
            changes: { state: 'ARCHIVED' },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'deleteCampaignNegativeKeywords',
                input: {
                    profileId: 3001,
                    region: 'na',
                    targets: [{ targetId: 'target-mutation-campaign-negative-1' }],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'target-mutation-campaign-negative-1',
            campaignId: 'target-mutation-campaign-1',
            adGroupId: null,
            state: 'ARCHIVED',
            deliveryStatus: 'NOT_DELIVERING',
            type: 'KEYWORD',
            negative: true,
            matchType: 'EXACT',
            keyword: 'free',
        });
        await expect(database.db.select().from(target)).resolves.toMatchObject([
            {
                targetId: 'target-mutation-campaign-negative-1',
                adGroupId: null,
                state: 'ARCHIVED',
                negative: true,
            },
        ]);
        await expect(
            database.db
                .select({
                    eventType: entityChangeHistory.eventType,
                    fieldName: entityChangeHistory.fieldName,
                    previousValue: entityChangeHistory.previousValue,
                    newValue: entityChangeHistory.newValue,
                })
                .from(entityChangeHistory)
                .where(eq(entityChangeHistory.entityId, 'target-mutation-campaign-negative-1'))
        ).resolves.toEqual([{ eventType: 'state_change', fieldName: 'state', previousValue: 'PAUSED', newValue: 'ARCHIVED' }]);
    });

    it('rejects invalid creation states, empty patches, negative bids, campaign-level negative state changes, and terminal transitions before Amazon', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values([
            buildTargetMutationAdGroup(),
            buildTargetMutationAdGroup({
                id: 'target-mutation-non-sp-ad-group-row-1',
                adGroupId: 'target-mutation-non-sp-ad-group-1',
                adProduct: 'SPONSORED_BRANDS',
            }),
        ]);
        await database.db.insert(target).values([
            buildTargetMutationTarget(),
            buildTargetMutationTarget({
                id: 'target-mutation-negative-row-1',
                targetId: 'target-mutation-negative-1',
                negative: true,
                bidAmount: null,
                targetKeyword: 'free',
                targetMatchType: 'PHRASE',
            }),
            buildTargetMutationTarget({
                id: 'target-mutation-campaign-negative-row-2',
                targetId: 'target-mutation-campaign-negative-2',
                adGroupId: null,
                negative: true,
                bidAmount: null,
                targetKeyword: 'free',
            }),
            buildTargetMutationTarget({
                id: 'target-mutation-archived-row-1',
                targetId: 'target-mutation-archived-1',
                state: 'ARCHIVED',
            }),
            buildTargetMutationTarget({
                id: 'target-mutation-non-sp-target-row-1',
                targetId: 'target-mutation-non-sp-target-1',
                adGroupId: 'target-mutation-non-sp-ad-group-1',
            }),
        ]);

        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        await expect(
            createKeywordTarget(context, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'invalid',
                matchType: 'BROAD',
                bid: 0.2,
                state: 'ARCHIVED',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createProductTarget(context, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                asin: 'B000000001',
                bid: 0.2,
                state: 'ARCHIVED',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createNegativeKeyword(context, {
                accountId: targetMutationAccountId,
                campaignId: 'target-mutation-campaign-1',
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'invalid',
                matchType: 'PHRASE',
                state: 'ARCHIVED',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createNegativeProductTarget(context, {
                accountId: targetMutationAccountId,
                campaignId: 'target-mutation-campaign-1',
                adGroupId: 'target-mutation-ad-group-1',
                asin: 'B000000001',
                state: 'ARCHIVED',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-target-1', changes: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-negative-1', changes: { bid: 0.5 } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-target-1', changes: { state: 'ARCHIVED', bid: 0.5 } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-campaign-negative-2', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-archived-1', changes: { state: 'ENABLED' } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-archived-1', changes: { bid: 0.5 } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateTarget(context, { accountId: targetMutationAccountId, targetId: 'target-mutation-non-sp-target-1', changes: { state: 'ENABLED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        expect(amazonAds.calls).toEqual([]);
    });

    it('does not cross account boundaries when creating or updating a Target', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildTargetMutationAccount(),
            buildTargetMutationAccount({
                id: targetMutationOtherAccountId,
                adsAccountId: 'other-target-mutation-ads-account',
                accountName: 'Other target mutation advertiser',
            }),
        ]);
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());
        await database.db.insert(target).values(buildTargetMutationTarget());

        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId, targetMutationOtherAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });

        await expect(
            createKeywordTarget(context, {
                accountId: targetMutationOtherAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'cross account',
                matchType: 'EXACT',
                bid: 0.3,
                state: 'PAUSED',
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(
            createNegativeKeyword(context, {
                accountId: targetMutationOtherAccountId,
                campaignId: 'target-mutation-campaign-1',
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'cross account',
                matchType: 'PHRASE',
                state: 'PAUSED',
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(
            updateTarget(context, {
                accountId: targetMutationOtherAccountId,
                targetId: 'target-mutation-target-1',
                changes: { state: 'PAUSED' },
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        expect(amazonAds.calls).toEqual([]);
    });

    it('maps Amazon rejection and synchronous unavailability to stable operation errors', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const rejectedContext = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({ responses: { createTargets: { error: [{ code: 'INVALID_ARGUMENT', message: 'keyword is not eligible' }] } } }),
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });
        await expect(
            createKeywordTarget(rejectedContext, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'rejected',
                matchType: 'EXACT',
                bid: 0.3,
                state: 'ENABLED',
            })
        ).rejects.toMatchObject({ code: 'AMAZON_REJECTED' });

        const unavailableContext = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({ failure: { operation: 'createTargets', message: '503 Service Unavailable' } }),
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'target-mutation-user',
            },
        });
        await expect(
            createProductTarget(unavailableContext, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                asin: 'B000000001',
                bid: 0.3,
                state: 'ENABLED',
            })
        ).rejects.toMatchObject({ code: 'AMAZON_UNAVAILABLE' });
    });
});
