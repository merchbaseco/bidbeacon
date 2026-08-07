import { and, asc, eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, campaign, entityChangeHistory, userAccountAccess } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { createCampaign, updateCampaign } from './campaign-mutations';
import { createOperationContext } from './operation-context';
import {
    buildAmazonCampaignResponse,
    buildCampaignMutationAccount,
    buildCampaignMutationArchiveRow,
    campaignMutationAccountId,
    campaignMutationOtherAccountId,
} from './testing/campaign-mutation-fixtures';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';

vi.mock('@/db/index', () => ({ db: {} }));

describe('Campaign mutation operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        vi.useRealTimers();
        await database?.close();
        database = undefined;
    });

    it('creates a Sponsored Products campaign with public controls, maps the Amazon response, archives it, and records Change events', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCampaignMutationAccount());
        await database.db.insert(userAccountAccess).values({
            merchbaseUserId: 'campaign-mutation-user',
            adsAccountId: 'campaign-mutation-ads-account',
            advertiserAccountId: campaignMutationAccountId,
        });

        const amazonCampaign = buildAmazonCampaignResponse();
        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createCampaigns: { success: [{ campaign: amazonCampaign }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        const result = await createCampaign(context, {
            accountId: campaignMutationAccountId,
            name: 'Created campaign',
            state: 'ENABLED',
            dailyBudget: 25,
            bidStrategy: 'DYNAMIC_DOWN_ONLY',
            targetingMode: 'MANUAL_KEYWORD',
            startDate: '2026-08-10',
            endDate: '2026-08-12',
            placementBidAdjustments: {
                topOfSearch: 50,
                restOfSearch: 10,
                productPages: 20,
                amazonBusiness: 5,
            },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'createCampaigns',
                input: {
                    profileId: 1001,
                    region: 'na',
                    campaigns: [
                        {
                            adProduct: 'SPONSORED_PRODUCTS',
                            name: 'Created campaign',
                            state: 'ENABLED',
                            startDateTime: '2026-08-10T07:00:00.000Z',
                            endDateTime: '2026-08-13T06:59:59.999Z',
                            marketplaceScope: 'SINGLE_MARKETPLACE',
                            countries: ['US'],
                            autoCreationSettings: { autoCreateTargets: false },
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
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'campaign-created-1',
            name: 'Created campaign',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            dailyBudget: 25,
            bidStrategy: 'DYNAMIC_DOWN_ONLY',
            targetingMode: 'MANUAL_KEYWORD',
            startDate: '2026-08-10',
            endDate: '2026-08-12',
            placementBidAdjustments: {
                topOfSearch: 50,
                restOfSearch: 10,
                productPages: 20,
                amazonBusiness: 5,
            },
        });

        await expect(database.db.select().from(campaign)).resolves.toMatchObject([
            {
                campaignId: 'campaign-created-1',
                accountId: 'campaign-mutation-ads-account',
                countryCode: 'US',
                name: 'Created campaign',
                state: 'ENABLED',
                budgetAmount: '25.00',
                bidStrategy: 'SALES_DOWN_ONLY',
                startDate: '2026-08-10',
                endDate: '2026-08-12',
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
            .where(eq(entityChangeHistory.entityId, 'campaign-created-1'))
            .orderBy(asc(entityChangeHistory.fieldName));
        expect(changes).toEqual([
            { eventType: 'bid_change', fieldName: 'bidStrategy', previousValue: null, newValue: 'DYNAMIC_DOWN_ONLY', source: 'bidbeacon' },
            { eventType: 'budget_change', fieldName: 'budgetAmount', previousValue: null, newValue: '25', source: 'bidbeacon' },
            {
                eventType: 'bid_change',
                fieldName: 'placementBidAdjustments',
                previousValue: null,
                newValue: '{"topOfSearch":50,"restOfSearch":10,"productPages":20,"amazonBusiness":5}',
                source: 'bidbeacon',
            },
            { eventType: 'state_change', fieldName: 'state', previousValue: null, newValue: 'ENABLED', source: 'bidbeacon' },
        ]);
    });

    it('updates every supported Campaign control and preserves omitted placement keys', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-06T16:00:00.000Z'));
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCampaignMutationAccount());
        await database.db.insert(campaign).values(buildCampaignMutationArchiveRow());

        const amazonCampaign = buildAmazonCampaignResponse({
            campaignId: 'campaign-existing-1',
            name: 'Existing campaign',
            state: 'ENABLED',
            status: { deliveryStatus: 'DELIVERING' },
            startDateTime: '2026-08-01T07:00:00.000Z',
            endDateTime: '2026-09-01T06:59:59.999Z',
            budgets: [
                {
                    budgetValue: {
                        monetaryBudgetValue: {
                            monetaryBudget: { value: 40, currencyCode: 'USD' },
                        },
                    },
                },
            ],
            optimizations: {
                bidSettings: {
                    bidStrategy: 'SALES_UP_AND_DOWN',
                    bidAdjustments: {
                        placementBidAdjustments: [
                            { placement: 'REST_OF_SEARCH', percentage: 0 },
                            { placement: 'PRODUCT_PAGE', percentage: 20 },
                        ],
                    },
                },
            },
        });
        const amazonAds = createFakeAmazonAdsGateway({
            responses: { updateCampaigns: { success: [{ campaign: amazonCampaign }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        const result = await updateCampaign(context, {
            accountId: campaignMutationAccountId,
            campaignId: 'campaign-existing-1',
            changes: {
                state: 'ENABLED',
                dailyBudget: 40,
                bidStrategy: 'DYNAMIC_UP_AND_DOWN',
                placementBidAdjustments: { restOfSearch: 0, productPages: 20 },
            },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'updateCampaigns',
                input: {
                    profileId: 1001,
                    region: 'na',
                    campaigns: [
                        {
                            campaignId: 'campaign-existing-1',
                            state: 'ENABLED',
                            budgets: [
                                {
                                    budgetType: 'MONETARY',
                                    recurrenceTimePeriod: 'DAILY',
                                    budgetValue: {
                                        monetaryBudgetValue: {
                                            monetaryBudget: { value: 40, currencyCode: 'USD' },
                                        },
                                    },
                                },
                            ],
                            optimizations: {
                                bidSettings: {
                                    bidStrategy: 'SALES_UP_AND_DOWN',
                                    bidAdjustments: {
                                        placementBidAdjustments: [
                                            { placement: 'REST_OF_SEARCH', percentage: 0 },
                                            { placement: 'PRODUCT_PAGE', percentage: 20 },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ]);
        expect(result).toEqual({
            id: 'campaign-existing-1',
            name: 'Existing campaign',
            state: 'ENABLED',
            deliveryStatus: 'DELIVERING',
            dailyBudget: 40,
            bidStrategy: 'DYNAMIC_UP_AND_DOWN',
            targetingMode: 'MANUAL_KEYWORD',
            startDate: '2026-08-01',
            endDate: '2026-08-31',
            placementBidAdjustments: { productPages: 20 },
        });

        await expect(database.db.select().from(campaign)).resolves.toMatchObject([
            {
                id: 'campaign-archive-1',
                campaignId: 'campaign-existing-1',
                state: 'ENABLED',
                budgetAmount: '40.00',
                bidStrategy: 'SALES_UP_AND_DOWN',
            },
        ]);
        const changes = await database.db
            .select({ eventType: entityChangeHistory.eventType, fieldName: entityChangeHistory.fieldName, previousValue: entityChangeHistory.previousValue, newValue: entityChangeHistory.newValue })
            .from(entityChangeHistory)
            .where(eq(entityChangeHistory.entityId, 'campaign-existing-1'))
            .orderBy(asc(entityChangeHistory.fieldName));
        expect(changes).toEqual([
            { eventType: 'bid_change', fieldName: 'bidStrategy', previousValue: 'DYNAMIC_DOWN_ONLY', newValue: 'DYNAMIC_UP_AND_DOWN' },
            { eventType: 'budget_change', fieldName: 'budgetAmount', previousValue: '25', newValue: '40' },
            { eventType: 'bid_change', fieldName: 'placementBidAdjustments', previousValue: null, newValue: '{"productPages":20}' },
            { eventType: 'state_change', fieldName: 'state', previousValue: 'PAUSED', newValue: 'ENABLED' },
        ]);
    });

    it('archives a Campaign through the Amazon delete endpoint', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCampaignMutationAccount());
        await database.db.insert(campaign).values(buildCampaignMutationArchiveRow());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: { deleteCampaigns: { success: [{ campaignId: 'campaign-existing-1' }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        const result = await updateCampaign(context, {
            accountId: campaignMutationAccountId,
            campaignId: 'campaign-existing-1',
            changes: { state: 'ARCHIVED' },
        });

        expect(amazonAds.calls).toEqual([
            {
                operation: 'deleteCampaigns',
                input: { profileId: 1001, region: 'na', campaigns: [{ campaignId: 'campaign-existing-1' }] },
            },
        ]);
        expect(result).toMatchObject({ id: 'campaign-existing-1', state: 'ARCHIVED', deliveryStatus: 'NOT_DELIVERING' });
        await expect(database.db.select().from(campaign)).resolves.toMatchObject([{ campaignId: 'campaign-existing-1', state: 'ARCHIVED' }]);
    });

    it('maps the fixed strategy and automatic targeting mode without leaking public enum names to Amazon', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCampaignMutationAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: {
                    success: [
                        {
                            campaign: buildAmazonCampaignResponse({
                                campaignId: 'campaign-auto-1',
                                name: 'Auto campaign',
                                state: 'PAUSED',
                                status: { deliveryStatus: 'NOT_DELIVERING' },
                                endDateTime: null,
                                autoCreationSettings: { autoCreateTargets: true },
                                optimizations: { bidSettings: { bidStrategy: 'MANUAL' } },
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
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        await expect(
            createCampaign(context, {
                accountId: campaignMutationAccountId,
                name: 'Auto campaign',
                state: 'PAUSED',
                dailyBudget: 10,
                bidStrategy: 'FIXED',
                targetingMode: 'AUTO',
                startDate: '2026-08-10',
            })
        ).resolves.toMatchObject({
            id: 'campaign-auto-1',
            bidStrategy: 'FIXED',
            targetingMode: 'AUTO',
            endDate: null,
        });
        expect(amazonAds.calls[0]).toEqual({
            operation: 'createCampaigns',
            input: expect.objectContaining({
                profileId: 1001,
                region: 'na',
                campaigns: [
                    expect.objectContaining({
                        state: 'PAUSED',
                        autoCreationSettings: { autoCreateTargets: true },
                        optimizations: { bidSettings: { bidStrategy: 'MANUAL' } },
                    }),
                ],
            }),
        });
    });

    it('honors an explicit empty placement result instead of restoring submitted adjustments', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildCampaignMutationAccount());
        const amazonAds = createFakeAmazonAdsGateway({
            responses: {
                createCampaigns: {
                    success: [
                        {
                            campaign: buildAmazonCampaignResponse({
                                optimizations: {
                                    bidSettings: {
                                        bidStrategy: 'SALES_DOWN_ONLY',
                                        bidAdjustments: { placementBidAdjustments: [] },
                                    },
                                },
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
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        const result = await createCampaign(context, {
            accountId: campaignMutationAccountId,
            name: 'Created campaign',
            state: 'ENABLED',
            dailyBudget: 25,
            bidStrategy: 'DYNAMIC_DOWN_ONLY',
            targetingMode: 'MANUAL_KEYWORD',
            startDate: '2026-08-10',
            endDate: '2026-08-12',
            placementBidAdjustments: { topOfSearch: 50 },
        });

        expect(result.placementBidAdjustments).toBeUndefined();
        await expect(
            database.db
                .select()
                .from(entityChangeHistory)
                .where(and(eq(entityChangeHistory.entityId, 'campaign-created-1'), eq(entityChangeHistory.fieldName, 'placementBidAdjustments')))
        ).resolves.toEqual([]);
    });

    it('rejects invalid input, missing campaigns, Amazon rejection, unavailability, and cross-account access', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values([
            buildCampaignMutationAccount(),
            buildCampaignMutationAccount({
                id: campaignMutationOtherAccountId,
                adsAccountId: 'other-campaign-mutation-ads-account',
                accountName: 'Other advertiser',
            }),
        ]);
        await database.db.insert(campaign).values(buildCampaignMutationArchiveRow());

        const context = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({
                responses: { createCampaigns: { error: [{ code: 'INVALID_ARGUMENT', message: 'name already exists' }] } },
            }),
            db: database.db,
            principal: {
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });

        await expect(
            createCampaign(context, { accountId: campaignMutationAccountId, name: '', state: 'ENABLED', dailyBudget: 25, bidStrategy: 'FIXED', targetingMode: 'AUTO', startDate: '2026-02-30' })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createCampaign(context, {
                accountId: campaignMutationAccountId,
                name: 'Archived create',
                state: 'ARCHIVED',
                dailyBudget: 25,
                bidStrategy: 'FIXED',
                targetingMode: 'AUTO',
                startDate: '2026-08-10',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(
            createCampaign(context, {
                accountId: campaignMutationAccountId,
                name: 'Invalid date range',
                state: 'PAUSED',
                dailyBudget: 25,
                bidStrategy: 'FIXED',
                targetingMode: 'AUTO',
                startDate: '2026-08-10',
                endDate: '2026-08-09',
            })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateCampaign(context, { accountId: campaignMutationAccountId, campaignId: 'campaign-existing-1', changes: {} })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
        await expect(updateCampaign(context, { accountId: campaignMutationAccountId, campaignId: 'campaign-existing-1', changes: { name: 'not supported' } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateCampaign(context, { accountId: campaignMutationAccountId, campaignId: 'campaign-existing-1', changes: { state: 'ARCHIVED', dailyBudget: 40 } })).rejects.toMatchObject({
            code: 'INVALID_INPUT',
        });
        await expect(updateCampaign(context, { accountId: campaignMutationAccountId, campaignId: 'missing', changes: { state: 'ARCHIVED' } })).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
        await expect(updateCampaign(context, { accountId: campaignMutationOtherAccountId, campaignId: 'campaign-existing-1', changes: { state: 'PAUSED' } })).rejects.toMatchObject({
            code: 'ACCOUNT_ACCESS_DENIED',
        });
        await expect(
            createCampaign(context, { accountId: campaignMutationAccountId, name: 'Rejected', state: 'ENABLED', dailyBudget: 25, bidStrategy: 'FIXED', targetingMode: 'AUTO', startDate: '2026-08-10' })
        ).rejects.toMatchObject({ code: 'AMAZON_REJECTED' });

        const unavailableContext = createOperationContext({
            amazonAds: createFakeAmazonAdsGateway({ failure: { operation: 'createCampaigns', message: '503 Service Unavailable' } }),
            db: database.db,
            principal: {
                accessibleAccountIds: [campaignMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'campaign-mutation-user',
            },
        });
        await expect(
            createCampaign(unavailableContext, {
                accountId: campaignMutationAccountId,
                name: 'Unavailable',
                state: 'PAUSED',
                dailyBudget: 25,
                bidStrategy: 'FIXED',
                targetingMode: 'AUTO',
                startDate: '2026-08-10',
            })
        ).rejects.toMatchObject({ code: 'AMAZON_UNAVAILABLE' });
    });
});
