// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: it boots a WebAssembly Postgres and applies the
// production migrations, which costs seconds. It runs in the `test:integration`
// lane instead, via `vitest.integration.config.ts`.
//
// The plan test proves what the seed *builds*. This proves what the seed
// *delivers*: the plan is written through the real writer into a real Postgres,
// and the dashboard's own routers are then asked the questions the dashboard
// asks. If a column type, a foreign key, or a join drifts, this fails.
import { PGlite } from '@electric-sql/pglite';
import { formatInTimeZone } from 'date-fns-tz';
import { getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { accountsRouter } from '@/api/app/accounts';
import { metricsRouter } from '@/api/app/metrics';
import { performanceRouter } from '@/api/app/performance';
import { reportsRouter } from '@/api/app/reports';
import {
    accountDatasetMetadata,
    ad,
    adGroup,
    advertiserAccount,
    amsMetrics,
    apiMetrics,
    campaign,
    changeHistorySyncState,
    entityChangeHistory,
    events,
    jobMetrics,
    performanceDaily,
    performanceHourly,
    reportDatasetMetadata,
    target,
    userAccountAccess,
    userPreferences,
} from '@/db/schema';
import { applyProductionMigrations } from '@/operations/testing/create-test-database';
import { buildDevSeedPlan, DEFAULT_SEED_OPTIONS } from './plan';
import { type SeedDatabase, writeDevSeedPlan } from './write-plan';

// The routers read the process-wide `db`, so the suite points that at PGlite.
const live = vi.hoisted(() => ({ database: null as unknown as Record<string, unknown> }));
vi.mock('@/db/index', () => ({
    db: new Proxy(
        {},
        {
            get: (_unused, property: string) => {
                const value = live.database?.[property];
                return typeof value === 'function' ? value.bind(live.database) : value;
            },
        }
    ),
}));

/** Every table the plan writes, keyed exactly as `plan.rows` keys them. */
const SEEDED_TABLES = {
    accountDatasetMetadata,
    ad,
    adGroup,
    advertiserAccount,
    amsMetrics,
    apiMetrics,
    campaign,
    changeHistorySyncState,
    entityChangeHistory,
    events,
    jobMetrics,
    performanceDaily,
    performanceHourly,
    reportDatasetMetadata,
    target,
    userAccountAccess,
    userPreferences,
};

const NOW = new Date();
const OPTIONS = { ...DEFAULT_SEED_OPTIONS, now: NOW };

let client: PGlite;
let plan: ReturnType<typeof buildDevSeedPlan>;

const createCaller = (accessibleAccountIds: string[]) => ({
    accounts: accountsRouter.createCaller(createContext(accessibleAccountIds)),
    metrics: metricsRouter.createCaller(createContext(accessibleAccountIds)),
    performance: performanceRouter.createCaller(createContext(accessibleAccountIds)),
    reports: reportsRouter.createCaller(createContext(accessibleAccountIds)),
});

beforeAll(async () => {
    client = await PGlite.create('memory://');
    await applyProductionMigrations(client);
    live.database = drizzle(client, { schema: SEEDED_TABLES }) as unknown as Record<string, unknown>;

    plan = buildDevSeedPlan(OPTIONS);
    await writeDevSeedPlan(live.database as unknown as SeedDatabase, plan);
}, 60_000);

describe('the seeded database answers the dashboard', () => {
    it('lists the account and reports it as synced', async () => {
        const caller = createCaller([plan.accountId]);

        await expect(caller.accounts.list()).resolves.toHaveLength(1);
        await expect(caller.accounts.datasetMetadata({ accountId: plan.accountId, countryCode: plan.countryCode })).resolves.toMatchObject({
            campaignsCount: plan.rows.campaign.length,
            fetchingCampaigns: false,
        });
    });

    it('returns a full window of daily performance ending today', async () => {
        const caller = createCaller([plan.accountId]);
        const { data } = await caller.metrics.dailyPerformance({ accountId: plan.accountId, days: 14 });

        expect(data).toHaveLength(14);
        expect(data.filter(point => point.impressions > 0).length).toBeGreaterThan(7);
        expect(data.at(-1)?.impressions).toBeGreaterThan(0);
        expect(data.some(point => point.acos > 0 && point.cpc > 0)).toBe(true);
    });

    it('returns today at hourly granularity with a comparison', async () => {
        const caller = createCaller([plan.accountId]);
        const result = await caller.metrics.hourlyPerformance({ accountId: plan.accountId, countryCode: plan.countryCode, range: 'today' });

        expect(result.points).toHaveLength(24);
        expect(result.totals.impressions).toBeGreaterThan(0);
        expect(result.totals.spend).toBeGreaterThan(0);
    });

    it('groups the performance table by every dimension', async () => {
        const caller = createCaller([plan.accountId]);
        const range = { endDate: formatInTimeZone(NOW, plan.timezone, 'MM-dd-yyyy'), startDate: formatInTimeZone(new Date(NOW.getTime() - 13 * 86_400_000), plan.timezone, 'MM-dd-yyyy') };

        for (const dimension of ['campaign', 'adGroup', 'ad', 'target'] as const) {
            const { rows } = await caller.performance.table({ accountId: plan.accountId, dimension, range });

            expect(rows.length, `${dimension} returned no rows`).toBeGreaterThan(0);
            expect(rows.every(row => row.metrics.impressions > 0)).toBe(true);
        }

        // The joins are the point: a campaign row without its name means the
        // seeded performance rows do not line up with the seeded structure.
        const { rows: campaignRows } = await caller.performance.table({ accountId: plan.accountId, dimension: 'campaign', range });
        expect(campaignRows.every(row => row.dimension === 'campaign' && row.name.startsWith('SP - '))).toBe(true);

        const { rows: targetRows } = await caller.performance.table({ accountId: plan.accountId, dimension: 'target', range });
        expect(targetRows.every(row => row.dimension === 'target' && !row.targetDisplay.startsWith('Target · '))).toBe(true);
        expect(targetRows.some(row => row.dimension === 'target' && row.targetKeyword !== null)).toBe(true);
    });

    it('serves the reports table and the event stream', async () => {
        const caller = createCaller([plan.accountId]);
        const reports = await caller.reports.summary({ accountId: plan.accountId, aggregation: 'daily', countryCode: plan.countryCode });
        expect(reports.total).toBeGreaterThan(0);

        const eventStream = await caller.metrics.events({
            accountId: plan.accountId,
            countryCode: plan.countryCode,
            from: new Date(NOW.getTime() - 6 * 60 * 60 * 1000).toISOString(),
            to: NOW.toISOString(),
        });
        expect(eventStream.events.length).toBeGreaterThan(0);
        expect(eventStream.histogram.some(bucket => bucket.count > 0)).toBe(true);
    });

    it('finds seeded entities through account search', async () => {
        const caller = createCaller([plan.accountId]);
        const { results } = await caller.metrics.searchEntities({ accountId: plan.accountId, query: 'merino' });

        expect(results.length).toBeGreaterThan(0);
        expect(results.some(result => result.type === 'campaign')).toBe(true);
    });

    it('still refuses an account the caller cannot access', async () => {
        const caller = createCaller([]);

        await expect(caller.metrics.dailyPerformance({ accountId: plan.accountId, days: 7 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refills rather than duplicates when it runs again', async () => {
        const before = await countSeededRows();
        await writeDevSeedPlan(live.database as unknown as SeedDatabase, buildDevSeedPlan(OPTIONS));
        const after = await countSeededRows();

        expect(after).toEqual(before);
        expect(after.performanceDaily).toBe(plan.rows.performanceDaily.length);
        expect(after.jobMetrics).toBe(plan.rows.jobMetrics.length);
    });
});

const countSeededRows = async () => {
    const counts: Record<string, number> = {};
    for (const [name, table] of Object.entries(SEEDED_TABLES)) {
        const result = await client.query<{ count: number }>(`select count(*)::int as count from "${getTableName(table)}"`);
        counts[name] = result.rows[0]?.count ?? 0;
    }
    return counts;
};

const createContext = (accessibleAccountIds: string[]) => ({
    accessCredential: null,
    accessError: null,
    accessibleAccountIds,
    accessibleAdvertiserAccountIds: [],
    authType: 'access' as const,
    credentialKind: 'session' as const,
    request: null,
    user: { merchbaseUserId: DEFAULT_SEED_OPTIONS.merchbaseUserId },
});
