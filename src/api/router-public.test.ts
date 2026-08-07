import { afterEach, describe, expect, it } from 'vitest';
import { advertiserAccount, campaign } from '@/db/schema';
import { createFakeAmazonAdsGateway } from '@/operations/amazon-ads-gateway';
import { createOperationContext, type OperationContext } from '@/operations/operation-context';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildAdvertiserAccount, buildCampaign } from '@/operations/testing/fixtures';
import { publicAppRouter } from './router-public';

const accountId = '00000000-0000-4000-8000-000000000001';

describe('public operation router', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('exposes the canonical operation names and delegates to shared operations', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: accountId }));
        await database.db.insert(campaign).values(buildCampaign());

        const caller = publicAppRouter.createCaller(
            createTestContext(
                createOperationContext({
                    amazonAds: createFakeAmazonAdsGateway(),
                    db: database.db as never,
                    principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'mbu_public_router_test' },
                })
            )
        );

        await expect(caller.list_advertiser_accounts({})).resolves.toMatchObject({ accounts: [{ id: accountId }] });
        await expect(caller.search({ accountId, resource: 'campaign', fields: ['campaign.id'] })).resolves.toMatchObject({
            rows: [{ 'campaign.id': 'campaign-1' }],
        });
        expect(Object.keys(publicAppRouter._def.procedures).sort()).toEqual([
            'create_ad',
            'create_ad_group',
            'create_campaign',
            'create_keyword_target',
            'create_negative_keyword',
            'create_negative_product_target',
            'create_product_target',
            'create_sponsored_products_campaign',
            'list_advertiser_accounts',
            'search',
            'update_ad',
            'update_ad_group',
            'update_campaign',
            'update_target',
        ]);
    });

    it('returns the stable operation error code and details through tRPC', async () => {
        database = await createTestDatabase();
        const caller = publicAppRouter.createCaller(
            createTestContext(
                createOperationContext({
                    amazonAds: createFakeAmazonAdsGateway(),
                    db: database.db as never,
                    principal: { accessibleAccountIds: [], credentialKind: 'api_key', merchbaseUserId: 'mbu_public_router_test' },
                })
            )
        );

        await expect(caller.search({ accountId, resource: 'campaign' })).rejects.toMatchObject({
            cause: { code: 'ACCOUNT_ACCESS_DENIED', details: {} },
        });
    });
});

const createTestContext = (operationContext: OperationContext) => ({
    accessError: null,
    accessibleAccountIds: [],
    accessibleAdvertiserAccountIds: [accountId],
    authType: 'access' as const,
    credentialKind: 'api_key' as const,
    operationContext,
    request: null,
    user: { merchbaseUserId: 'mbu_public_router_test' },
});
