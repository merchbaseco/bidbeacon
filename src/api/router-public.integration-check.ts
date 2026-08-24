// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advertiserAccount, campaign } from '@/db/schema';
import { createFakeAmazonAdsGateway } from '@/operations/amazon-ads-gateway';
import { createOperationContext, type OperationContext } from '@/operations/operation-context';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildAdvertiserAccount, buildCampaign } from '@/operations/testing/fixtures';
import { publicAppRouter } from './router-public';

const productionContextMocks = vi.hoisted(() => ({
    createProductionOperationContext: vi.fn(),
}));

vi.mock('@/operations/production-operation-context', () => productionContextMocks);

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
        await expect(
            caller.performance({
                accountId,
                dimension: 'account',
                interval: 'day',
                dateRange: { startDate: '2026-08-10', endDate: '2026-08-10' },
                metrics: ['spend'],
            })
        ).resolves.toMatchObject({ totals: { spend: 0 }, points: [{ date: '2026-08-10', metrics: { spend: 0 } }] });
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
            'performance',
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

    it('forwards the authenticated Merchbase credential into the production operation context', async () => {
        database = await createTestDatabase();
        await database.db.insert(advertiserAccount).values(buildAdvertiserAccount({ id: accountId }));
        productionContextMocks.createProductionOperationContext.mockReturnValue(
            createOperationContext({
                amazonAds: createFakeAmazonAdsGateway(),
                db: database.db as never,
                principal: { accessibleAccountIds: [accountId], credentialKind: 'api_key', merchbaseUserId: 'mbu_public_router_test' },
            })
        );
        const caller = publicAppRouter.createCaller(createTestContext(undefined, 'ak_suite-key'));

        await expect(caller.search({ accountId, resource: 'campaign', fields: ['campaign.id'] })).resolves.toMatchObject({ rows: [] });
        expect(productionContextMocks.createProductionOperationContext).toHaveBeenCalledWith(
            {
                accessibleAccountIds: [accountId],
                credentialKind: 'api_key',
                merchbaseUserId: 'mbu_public_router_test',
            },
            'ak_suite-key'
        );
    });
});

const createTestContext = (operationContext?: OperationContext, accessCredential = 'ak_test') => ({
    accessCredential,
    accessError: null,
    accessibleAccountIds: [],
    accessibleAdvertiserAccountIds: [accountId],
    authType: 'access' as const,
    credentialKind: 'api_key' as const,
    ...(operationContext ? { operationContext } : {}),
    request: null,
    user: { merchbaseUserId: 'mbu_public_router_test' },
});
