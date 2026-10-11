// PGlite database-simulation suite. The `.integration-check.ts` suffix keeps
// this file out of the default Vitest discovery (`vitest.config.ts` includes
// `*.test.ts` only) on purpose: every test here boots a WebAssembly Postgres
// and applies the production migrations, which costs seconds per test and far
// more on a cold CI runner. It runs in the `test:integration` lane instead, via
// `vitest.integration.config.ts`. `bun run check` runs both lanes; the Quality
// workflow runs `check:fast`, the fast lane only. Add new database-backed
// suites with the same suffix — the lane is structural, with no list to keep.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';
import { workerControl } from '@/db/schema';
import { applyProductionMigrations, createTestDatabase, type TestDatabase } from '@/operations/testing/create-test-database';
import { recordAmsPoll } from '@/worker/record-ams-poll';

const productionShapeTag = '0062_light_roulette';
const polledAt = new Date('2026-10-11T17:46:00.000Z');
const polledAgainAt = new Date('2026-10-11T18:00:00.000Z');

describe('worker_control primary key', () => {
    let database: TestDatabase | undefined;

    afterEach(async () => {
        await database?.close();
        database = undefined;
    });

    it('records a poll on the drifted production rows and keeps the newest values', async () => {
        const client = new PGlite('memory://');
        const db = drizzle(client);
        try {
            await applyProductionMigrations(client, { throughTag: productionShapeTag });
            await client.exec('ALTER TABLE "worker_control" DROP CONSTRAINT "worker_control_pkey"');
            await client.exec(`
                INSERT INTO "worker_control" ("id", "enabled", "messages_per_second", "updated_at") VALUES
                    ('main', false, 4, '2025-12-01 06:56:21.166+00'),
                    ('main', true, 9, '2026-01-17 05:12:21.931591+00'),
                    ('other', true, 1, '2026-02-01 00:00:00+00')
            `);
            await applyProductionMigrations(client, { fromTag: productionShapeTag });

            await recordAmsPoll(db as never, polledAt);

            expect(await controlRows(db)).toEqual([
                {
                    enabled: true,
                    id: 'main',
                    lastPolledAt: polledAt,
                    messagesPerSecond: 9,
                    updatedAt: new Date('2026-01-17T05:12:21.931Z'),
                },
                {
                    enabled: true,
                    id: 'other',
                    lastPolledAt: null,
                    messagesPerSecond: 1,
                    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
                },
            ]);
            expect(await primaryKeyDefinition(client)).toBe('PRIMARY KEY (id)');

            await applyProductionMigrations(client, { fromTag: productionShapeTag });
            await recordAmsPoll(db as never, polledAgainAt);

            expect(await controlRows(db)).toEqual([
                {
                    enabled: true,
                    id: 'main',
                    lastPolledAt: polledAgainAt,
                    messagesPerSecond: 9,
                    updatedAt: new Date('2026-01-17T05:12:21.931Z'),
                },
                {
                    enabled: true,
                    id: 'other',
                    lastPolledAt: null,
                    messagesPerSecond: 1,
                    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
                },
            ]);
        } finally {
            await client.close();
        }
    });

    it('records a poll when the primary key is already present', async () => {
        database = await createTestDatabase();

        await recordAmsPoll(database.db as never, polledAt);

        expect(
            (await controlRows(database.db)).map(row => ({
                enabled: row.enabled,
                id: row.id,
                lastPolledAt: row.lastPolledAt,
                messagesPerSecond: row.messagesPerSecond,
            }))
        ).toEqual([
            {
                enabled: true,
                id: 'main',
                lastPolledAt: polledAt,
                messagesPerSecond: 0,
            },
        ]);
        expect(await primaryKeyDefinition(database.client)).toBe('PRIMARY KEY (id)');
    });
});

const controlRows = async (db: ReturnType<typeof drizzle>) => {
    const rows = await db
        .select({
            enabled: workerControl.enabled,
            id: workerControl.id,
            lastPolledAt: workerControl.lastPolledAt,
            messagesPerSecond: workerControl.messagesPerSecond,
            updatedAt: workerControl.updatedAt,
        })
        .from(workerControl)
        .orderBy(workerControl.id);
    return rows;
};

const primaryKeyDefinition = async (client: PGlite) => {
    const result = await client.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'worker_control'::regclass
           AND contype = 'p'`
    );
    return result.rows.map(row => row.definition).join(',');
};
