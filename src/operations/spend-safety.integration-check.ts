import { afterEach, describe, expect, it, vi } from 'vitest';
import { adGroup, advertiserAccount, campaign, target } from '@/db/schema';
import { createFakeAmazonAdsGateway } from './amazon-ads-gateway';
import { updateCampaign } from './campaign-mutations';
import { createOperationContext } from './operation-context';
import { resetSpendWriteQuotaForTests } from './spend-safety';
import { createKeywordTarget, updateTarget } from './target-mutations';
import { createTestDatabase, type TestDatabase } from './testing/create-test-database';
import {
    buildAmazonKeywordTargetResponse,
    buildTargetMutationAccount,
    buildTargetMutationAdGroup,
    buildTargetMutationCampaign,
    buildTargetMutationTarget,
    targetMutationAccountId,
} from './testing/target-mutation-fixtures';

vi.mock('@/db/index', () => ({ db: {} }));

describe('Spend safety on shared write operations', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        resetSpendWriteQuotaForTests();
        await database?.close();
        database = undefined;
    });

    it('allows a keyword bid at the ceiling and refuses just above without calling Amazon', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { createTargets: { success: [{ target: buildAmazonKeywordTargetResponse({ bid: { bid: 5 } }) }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'spend-safety-user',
            },
        });

        await expect(
            createKeywordTarget(context, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'ceiling bid',
                matchType: 'EXACT',
                bid: 5,
                state: 'ENABLED',
            })
        ).resolves.toMatchObject({ bid: 5 });
        expect(amazonAds.calls).toHaveLength(1);

        await expect(
            createKeywordTarget(context, {
                accountId: targetMutationAccountId,
                adGroupId: 'target-mutation-ad-group-1',
                keyword: 'over ceiling',
                matchType: 'EXACT',
                bid: 5.01,
                state: 'ENABLED',
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { field: 'bid', requested: 5.01, max: 5 },
        });
        expect(amazonAds.calls).toHaveLength(1);
    });

    it('refuses an over-ceiling target bid update from the shared public operation path', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());
        await database.db.insert(adGroup).values(buildTargetMutationAdGroup());
        await database.db.insert(target).values(buildTargetMutationTarget());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { updateTargets: { success: [{ target: buildAmazonKeywordTargetResponse({ bid: { bid: 50 } }) }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'spend-safety-user',
            },
        });

        await expect(
            updateTarget(context, {
                accountId: targetMutationAccountId,
                targetId: 'target-mutation-target-1',
                changes: { bid: 50 },
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { field: 'bid', requested: 50, max: 5 },
        });
        expect(amazonAds.calls).toHaveLength(0);
    });

    it('refuses an over-ceiling campaign daily budget without calling Amazon', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { updateCampaigns: { success: [{ campaign: { campaignId: 'target-mutation-campaign-1' } }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'session',
                merchbaseUserId: 'spend-safety-user',
            },
        });

        await expect(
            updateCampaign(context, {
                accountId: targetMutationAccountId,
                campaignId: 'target-mutation-campaign-1',
                changes: { dailyBudget: 100.01 },
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { field: 'dailyBudget', requested: 100.01, max: 100 },
        });
        expect(amazonAds.calls).toHaveLength(0);
    });

    it('refuses DYNAMIC_UP_AND_DOWN because it can raise effective bids above the ceiling', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildTargetMutationAccount());
        await database.db.insert(campaign).values(buildTargetMutationCampaign());

        const amazonAds = createFakeAmazonAdsGateway({
            responses: { updateCampaigns: { success: [{ campaign: { campaignId: 'target-mutation-campaign-1' } }] } },
        });
        const context = createOperationContext({
            amazonAds,
            db: database.db,
            principal: {
                accessibleAccountIds: [targetMutationAccountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'spend-safety-user',
            },
        });

        await expect(
            updateCampaign(context, {
                accountId: targetMutationAccountId,
                campaignId: 'target-mutation-campaign-1',
                changes: { bidStrategy: 'DYNAMIC_UP_AND_DOWN' },
            })
        ).rejects.toMatchObject({
            code: 'INVALID_INPUT',
            details: { field: 'bidStrategy', requested: 'DYNAMIC_UP_AND_DOWN' },
        });
        expect(amazonAds.calls).toHaveLength(0);
    });
});
