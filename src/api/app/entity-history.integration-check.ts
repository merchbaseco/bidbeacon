// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { afterEach, describe, expect, it } from 'vitest';
import { campaign, entityChangeHistory, target } from '@/db/schema';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { buildCampaign, buildEntityChangeHistory, buildTarget } from '@/operations/testing/fixtures';
import { createEntityHistoryRouter } from './entity-history';

describe('dashboard entity history router', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('preserves the latest account-local Target bid transition behind session auth', async () => {
        database = await createTestDatabase();
        await database.db.insert(campaign).values(buildCampaign());
        await database.db.insert(target).values(buildTarget());
        await database.db.insert(entityChangeHistory).values([
            buildEntityChangeHistory({
                entityType: 'target',
                entityId: 'target-1',
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                localDate: '2026-08-05',
                previousValue: '0.75',
                newValue: '0.90',
                changedAt: new Date('2026-08-05T15:00:00.000Z'),
            }),
            buildEntityChangeHistory({
                entityType: 'target',
                entityId: 'target-1',
                eventType: 'bid_change',
                fieldName: 'bidAmount',
                localDate: '2026-08-05',
                previousValue: '0.90',
                newValue: '1.10',
                changedAt: new Date('2026-08-05T16:00:00.000Z'),
            }),
        ]);

        const router = createEntityHistoryRouter(database.db as never, () => new Date('2026-08-05T17:00:00.000Z'));
        const caller = router.createCaller(createContext(['ads-account-1']));

        await expect(caller.latestTargetBidChange({ accountId: 'ads-account-1', targetId: 'target-1' })).resolves.toEqual({
            changedAt: '2026-08-05T16:00:00.000Z',
            previousValue: '0.90',
            newValue: '1.10',
        });
    });

    it('retains dashboard account authorization', async () => {
        database = await createTestDatabase();
        const router = createEntityHistoryRouter(database.db as never);
        const caller = router.createCaller(createContext([]));

        await expect(caller.latestTargetBidChange({ accountId: 'ads-account-1', targetId: 'target-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
});

const createContext = (accessibleAccountIds: string[]) => ({
    accessError: null,
    accessibleAccountIds,
    accessibleAdvertiserAccountIds: [],
    authType: 'access' as const,
    credentialKind: 'session' as const,
    request: null,
    user: { merchbaseUserId: 'mbu_entity_history_test' },
});
