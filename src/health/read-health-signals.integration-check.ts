// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { jobMetrics, workerControl } from '@/db/schema';
import { assessHealth, healthChecks } from '@/health/health-checks';
import { readHealthSignals } from '@/health/read-health-signals';
import { registerHealthRoute } from '@/health/register-health-route';
import { createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { recordAmsPoll } from '@/worker/record-ams-poll';

const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const processStartedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);

describe('read health signals', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('reports ok when every catalog job succeeded now and the stream was polled now', async () => {
        database = await createTestDatabase();
        const finishedAt = new Date();
        await insertJobs(
            database,
            jobChecks.map(check => ({
                finishedAt,
                jobName: check.jobName,
                status: 'succeeded',
            }))
        );
        await recordAmsPoll(database.db as never, finishedAt);

        const signals = await readHealthSignals(database.db as never, processStartedAt);
        expect(assessHealth(signals)).toEqual({ status: 'ok' });

        const app = Fastify({ logger: false });
        const db = database.db;
        registerHealthRoute(app, {
            readSignals: () => readHealthSignals(db as never, processStartedAt),
        });
        await app.ready();
        const response = await app.inject({
            method: 'GET',
            url: '/api/health',
        });
        await app.close();

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            service: 'bidbeacon-server',
            status: 'ok',
            timestamp: expect.stringMatching(isoTimestamp),
        });
    });

    it('fails report-dispatch when a newer failed row follows a stale success', async () => {
        database = await createTestDatabase();
        const now = new Date();
        const reportDispatch = jobChecks.find(check => check.name === 'report-dispatch');
        if (!reportDispatch) {
            throw new Error('report-dispatch is missing from the health catalog');
        }

        await insertJobs(database, [
            ...jobChecks
                .filter(check => check.name !== 'report-dispatch')
                .map(check => ({
                    finishedAt: now,
                    jobName: check.jobName,
                    status: 'succeeded' as const,
                })),
            {
                finishedAt: new Date(now.getTime() - reportDispatch.maxAgeMs),
                jobName: reportDispatch.jobName,
                status: 'succeeded' as const,
            },
            {
                finishedAt: new Date(now.getTime() - 60 * 1000),
                jobName: reportDispatch.jobName,
                status: 'failed' as const,
            },
        ]);
        await recordAmsPoll(database.db as never, now);

        const signals = await readHealthSignals(database.db as never, processStartedAt);

        expect(assessHealth(signals)).toEqual({ status: 'degraded', failing: ['report-dispatch'] });
    });

    it('updates the poll time on a paused worker row and leaves enabled false', async () => {
        database = await createTestDatabase();
        const updatedAt = new Date('2026-10-01T00:00:00.000Z');
        await database.db.insert(workerControl).values({
            enabled: false,
            id: 'main',
            messagesPerSecond: 4,
            updatedAt,
        });

        const first = new Date('2026-10-08T12:00:00.000Z');
        const second = new Date('2026-10-08T13:00:00.000Z');
        await recordAmsPoll(database.db as never, first);
        await recordAmsPoll(database.db as never, second);

        const rows = await database.db.select().from(workerControl).where(eq(workerControl.id, 'main'));

        expect(rows).toHaveLength(1);
        expect(rows[0]?.enabled).toBe(false);
        expect(rows[0]?.messagesPerSecond).toBe(4);
        expect(rows[0]?.updatedAt).toEqual(updatedAt);
        expect(rows[0]?.lastPolledAt).toEqual(second);
    });
});

const jobChecks = healthChecks.filter((check): check is Extract<(typeof healthChecks)[number], { kind: 'job' }> => check.kind === 'job');

const insertJobs = async (database: TestDatabase, rows: Array<{ finishedAt: Date; jobName: string; status: 'failed' | 'succeeded' }>) => {
    await database.db.insert(jobMetrics).values(
        rows.map(row => ({
            bossJobId: `boss-${row.jobName}-${row.status}-${row.finishedAt.toISOString()}`,
            finishedAt: row.finishedAt,
            id: randomUUID(),
            jobName: row.jobName,
            startedAt: row.finishedAt,
            status: row.status,
        }))
    );
};
