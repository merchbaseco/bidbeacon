import { asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ad, adGroup, advertiserAccount, campaign, entityChangeHistory } from '@/db/schema';
import { createAd, createAdGroup, updateAd, updateAdGroup } from './ad-mutations';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createOperationContext } from './operation-context';
import {
    adMutationAccountId,
    adMutationOtherAccountId,
    buildAdMutationAccount,
    buildAdMutationAd,
    buildAdMutationAdGroup,
    buildAdMutationCampaign,
    buildAmazonAdGroupResponse,
    buildAmazonAdResponse,
} from './testing/ad-mutation-fixtures';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';

vi.mock('@/db/index', () => ({ db: {} }));

describe('Ad-group and Ad mutation operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('creates an Ad group, maps the accepted response, reconciles the archive, and records Change events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createAdGroups: { success: [{ adGroup: buildAmazonAdGroupResponse() }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        const result = await createAdGroup(context, {
            accountId: adMutationAccountId,
            campaignId: 'ad-mutation-campaign-1',
            name: 'Created ad group',
            state: 'ENABLED',
            defaultBid: 0.35,
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createAdGroups',
                input: {
                    profileId: 2001,
                    region: 'na',
                    adGroups: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            campaignId: 'ad-mutation-campaign-1',
                            name: 'Created ad group',
                            state: 'ENABLED',
                            bid: { defaultBid: 0.35 },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'ad-mutation-ad-group-created-1',
            campaignId: 'ad-mutation-campaign-1',
            name: 'Created ad group',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            defaultBid: 0.35,
        });

        await expect(database.db.select().from(adGroup)).resolves.toMatchObject([
            {
                id: 'ad-mutation-ad-group-created-1',
                adGroupId: 'ad-mutation-ad-group-created-1',
                campaignId: 'ad-mutation-campaign-1',
                name: 'Created ad group',
                state: 'ENABLED',
                deliveryStatus: 'DELIVERING',
                bidAmount: '0.35',
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
            .where(eq(entityChangeHistory.entityId, 'ad-mutation-ad-group-created-1'))
            .orderBy(asc(entityChangeHistory.fieldName));
        expect(changes).toEqual([
            { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: null, newValue: '0.35', source: 'bidbeacon' },
            { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: 'ENABLED', source: 'bidbeacon' },
        ]);
    });

    it('updates an Ad group with absolute controls and records only changed fields', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                updateAdGroups: {
                    success: [
                        {
                            adGroup: buildAmazonAdGroupResponse({
                                adGroupId: 'ad-mutation-ad-group-1',
                                state: 'ENABLED',
                                status: { deliveryStatus: 'DELIVERING' },
                                bid: { defaultBid: 0.5 },
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
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        const result = await updateAdGroup(context, {
            accountId: adMutationAccountId,
            adGroupId: 'ad-mutation-ad-group-1',
            changes: { state: 'ENABLED', defaultBid: 0.5 },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'updateAdGroups',
                input: {
                    profileId: 2001,
                    region: 'na',
                    adGroups: [
                        {
                            adGroupId: 'ad-mutation-ad-group-1',
                            state: 'ENABLED',
                            bid: { defaultBid: 0.5 },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'ad-mutation-ad-group-1',
            campaignId: 'ad-mutation-campaign-1',
            name: 'Created ad group',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            defaultBid: 0.5,
        });

        await expect(database.db.select().from(adGroup)).resolves.toMatchObject([
            {
                id: 'ad-mutation-ad-group-row-1',
                adGroupId: 'ad-mutation-ad-group-1',
                state: 'ENABLED',
                deliveryStatus: 'DELIVERING',
                bidAmount: '0.50',
            },
        ]);

        const changes = await database.db
            .select({
                eventType: entityChangeHistory.eventType,
                fieldName: entityChangeHistory.fieldName,
                previousValue: entityChangeHistory.previousValue,
                newValue: entityChangeHistory.newValue,
            })
            .from(entityChangeHistory)
            .where(eq(entityChangeHistory.entityId, 'ad-mutation-ad-group-1'))
            .orderBy(asc(entityChangeHistory.fieldName));
        expect(changes).toEqual([
            { eventType: 'bid_change', fieldName: 'bidAmount', previousValue: '0.25', newValue: '0.5' },
            { eventType: 'state_change', fieldName: 'state', previousValue: 'PAUSED', newValue: 'ENABLED' },
        ]);
    });

    it('archives an Ad group through the Amazon delete endpoint', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: { deleteAdGroups: { success: [{ adGroupId: 'ad-mutation-ad-group-1' }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        const result = await updateAdGroup(context, {
            accountId: adMutationAccountId,
            adGroupId: 'ad-mutation-ad-group-1',
            changes: { state: 'ARCHIVED' },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'deleteAdGroups',
                input: { profileId: 2001, region: 'na', adGroups: [{ adGroupId: 'ad-mutation-ad-group-1' }] },
            },
        ]);
        expect(result).toMatchObject({ id: 'ad-mutation-ad-group-1', state: 'ARCHIVED', deliveryStatus: 'NOT_DELIVERING' });
    });

    it('creates an Ad for an owned Ad group, maps the ASIN creative, reconciles the archive, and records a Change event', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createAds: { success: [{ ad: buildAmazonAdResponse() }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        const result = await createAd(context, {
            accountId: adMutationAccountId,
            adGroupId: 'ad-mutation-ad-group-1',
            asin: 'B000000001',
            state: 'ENABLED',
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createAds',
                input: {
                    profileId: 2001,
                    region: 'na',
                    ads: [
                        {
                            adGroupId: 'ad-mutation-ad-group-1',
                            adProduct: 'SPONSORED_PRODUCTS',
                            adType: 'PRODUCT_AD',
                            state: 'ENABLED',
                            creative: {
                                productCreative: {
                                    productCreativeSettings: {
                                        advertisedProduct: {
                                            productIdType: 'ASIN',
                                            productId: 'B000000001',
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'ad-mutation-ad-created-1',
            campaignId: 'ad-mutation-campaign-1',
            adGroupId: 'ad-mutation-ad-group-1',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            asin: 'B000000001',
            productTitle: 'Created product',
        });

        await expect(database.db.select().from(ad)).resolves.toMatchObject([
            {
                id: 'ad-mutation-ad-created-1',
                adId: 'ad-mutation-ad-created-1',
                campaignId: 'ad-mutation-campaign-1',
                adGroupId: 'ad-mutation-ad-group-1',
                state: 'ENABLED',
                deliveryStatus: 'DELIVERING',
                productAsin: 'B000000001',
                productTitle: 'Created product',
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
                .where(eq(entityChangeHistory.entityId, 'ad-mutation-ad-created-1'))
        ).resolves.toEqual([{ eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: 'ENABLED' }]);
    });

    it('updates an Ad state including terminal ARCHIVED, reconciles the accepted result, and records a Change event', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup());
        await database.db.insert(ad).values(buildAdMutationAd());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                deleteAds: { success: [{ adId: 'ad-mutation-ad-1' }] },
            },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        const result = await updateAd(context, {
            accountId: adMutationAccountId,
            adId: 'ad-mutation-ad-1',
            changes: { state: 'ARCHIVED' },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'deleteAds',
                input: {
                    profileId: 2001,
                    region: 'na',
                    ads: [{ adId: 'ad-mutation-ad-1' }],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'ad-mutation-ad-1',
            campaignId: 'ad-mutation-campaign-1',
            adGroupId: 'ad-mutation-ad-group-1',
            state: 'ARCHIVED',
            deliveryStatus: 'NOT_DELIVERING',
            asin: 'B000000001',
            productTitle: 'Existing product',
        });

        await expect(database.db.select().from(ad)).resolves.toMatchObject([
            {
                id: 'ad-mutation-ad-row-1',
                adId: 'ad-mutation-ad-1',
                state: 'ARCHIVED',
                deliveryStatus: 'NOT_DELIVERING',
                productAsin: 'B000000001',
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
                .where(eq(entityChangeHistory.entityId, 'ad-mutation-ad-1'))
        ).resolves.toEqual([{ eventType: 'state_change', fieldName: 'state', previousValue: 'PAUSED', newValue: 'ARCHIVED' }]);
    });

    it('rejects state transitions out of terminal ARCHIVED before invoking Amazon', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup({ state: 'ARCHIVED' }));
        await database.db.insert(ad).values(buildAdMutationAd({ state: 'ARCHIVED' }));

        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        await expect(updateAdGroup(context, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', changes: { state: 'ENABLED' } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateAd(context, { accountId: adMutationAccountId, adId: 'ad-mutation-ad-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        expect(amazonAds.calls).toEqual([]);
    });

    it('rejects non-Sponsored Products ancestry before invoking the Sponsored Products gateway', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdMutationAccount());
        await database.db.insert(campaign).values(buildAdMutationCampaign({ adProduct: 'SPONSORED_BRANDS' }));
        await database.db.insert(adGroup).values(buildAdMutationAdGroup({ adProduct: 'SPONSORED_BRANDS' }));
        await database.db.insert(ad).values(buildAdMutationAd({ adProduct: 'SPONSORED_BRANDS' }));

        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        await expect(
            createAdGroup(context, {
                accountId: adMutationAccountId,
                campaignId: 'ad-mutation-campaign-1',
                name: 'Unsupported Ad group',
                state: 'PAUSED',
                defaultBid: 0.35,
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(createAd(context, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', asin: 'B000000001', state: 'PAUSED' })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAdGroup(context, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAd(context, { accountId: adMutationAccountId, adId: 'ad-mutation-ad-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        expect(amazonAds.calls).toEqual([]);
    });

    it('maps invalid input, missing ancestry, cross-account IDs, Amazon rejection, and unavailability to stable errors', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildAdMutationAccount(),
            buildAdMutationAccount({
                id: adMutationOtherAccountId,
                adsAccountId: 'other-ad-mutation-ads-account',
                accountName: 'Other advertiser',
            }),
        ]);
        await database.db.insert(campaign).values(buildAdMutationCampaign());
        await database.db.insert(adGroup).values(buildAdMutationAdGroup());
        await database.db.insert(ad).values(buildAdMutationAd());

        const amazonAds = createFakeAmazonAdsGateway();
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId, adMutationOtherAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });

        await expect(
            createAdGroup(context, {
                accountId: adMutationAccountId,
                campaignId: 'ad-mutation-campaign-1',
                name: 'Invalid state',
                state: 'ARCHIVED',
                defaultBid: 0.35,
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createAd(context, {
                accountId: adMutationAccountId,
                adGroupId: 'ad-mutation-ad-group-1',
                asin: 'not-an-asin',
                state: 'ENABLED',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateAdGroup(context, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', changes: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateAdGroup(context, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', changes: { state: 'ARCHIVED', defaultBid: 0.5 } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateAd(context, { accountId: adMutationAccountId, adId: 'ad-mutation-ad-1', changes: { state: 'INVALID' } })).rejects.toMatchObject({ code: 'INVALID_INPUT' });

        await expect(
            createAdGroup(context, {
                accountId: adMutationAccountId,
                campaignId: 'missing-campaign',
                name: 'Missing campaign',
                state: 'ENABLED',
                defaultBid: 0.35,
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(createAd(context, { accountId: adMutationAccountId, adGroupId: 'missing-ad-group', asin: 'B000000001', state: 'ENABLED' })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAdGroup(context, { accountId: adMutationAccountId, adGroupId: 'missing-ad-group', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAd(context, { accountId: adMutationAccountId, adId: 'missing-ad', changes: { state: 'ARCHIVED' } })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(
            createAdGroup(context, {
                accountId: adMutationOtherAccountId,
                campaignId: 'ad-mutation-campaign-1',
                name: 'Cross-account Ad group',
                state: 'PAUSED',
                defaultBid: 0.35,
            })
        ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(createAd(context, { accountId: adMutationOtherAccountId, adGroupId: 'ad-mutation-ad-group-1', asin: 'B000000001', state: 'PAUSED' })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAdGroup(context, { accountId: adMutationOtherAccountId, adGroupId: 'ad-mutation-ad-group-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        await expect(updateAd(context, { accountId: adMutationOtherAccountId, adId: 'ad-mutation-ad-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'RESOURCE_NOT_FOUND',
        });
        expect(amazonAds.calls).toEqual([]);

        const rejectedContext = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({ responses: { createAdGroups: { error: [{ code: 'INVALID_ARGUMENT', message: 'name already exists' }] } } }),
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });
        await expect(
            createAdGroup(rejectedContext, {
                accountId: adMutationAccountId,
                campaignId: 'ad-mutation-campaign-1',
                name: 'Rejected',
                state: 'ENABLED',
                defaultBid: 0.35,
            })
        ).rejects.toMatchObject({ code: 'AMAZON_REJECTED' });

        const unavailableContext = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({ failure: { operation: 'createAds', message: '503 Service Unavailable' } }),
            db: database.db,
            principal: {
                accessibleAccountIds: [adMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'ad-mutation-user',
            },
        });
        await expect(createAd(unavailableContext, { accountId: adMutationAccountId, adGroupId: 'ad-mutation-ad-group-1', asin: 'B000000001', state: 'ENABLED' })).rejects.toMatchObject({
            code: 'AMAZON_UNAVAILABLE',
        });
    });
});
