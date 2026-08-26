#!/usr/bin/env node

/**
 * Fills a local database with one small fabricated advertiser account, so the
 * dashboard, the tRPC API, the MCP operations, and the `bb` CLI have a
 * realistic current week to render instead of empty states.
 *
 *   bun run db:seed:dev
 *   bun run db:seed:dev --seed=friday --days=21 --merchbase-user-id=mbu_...
 *
 * Never runs automatically on a developer machine. Local development resolves
 * `BIDBEACON_DATABASE_HOST` to the shared database over Tailscale, so the seed
 * refuses any host that is not loopback and there is no override flag. Cursor
 * cloud agents get it for free: `.cursor/start.sh` points the host at its own
 * PostgreSQL and seeds on every boot.
 *
 * Everything written is a local row. The seed never calls Amazon.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseConfig } from '@/db/database-config';
import { runMigrations } from '@/db/migrate';
import { assertLocalSeedTarget, describeTarget } from '@/dev-seed/local-database-guard';
import { buildDevSeedPlan, DEFAULT_SEED_OPTIONS } from '@/dev-seed/plan';
import { type SeedDatabase, writeDevSeedPlan } from '@/dev-seed/write-plan';

const args = new Map(
    process.argv.slice(2).map(value => {
        const [name, ...rest] = value.split('=');
        return [name, rest.join('=')] as const;
    })
);

const databaseConfig = getDatabaseConfig();
const target = assertLocalSeedTarget({
    database: databaseConfig.name,
    host: databaseConfig.host,
    nodeEnv: process.env.NODE_ENV,
    port: databaseConfig.port,
});

const now = new Date();
const options = {
    accountId: args.get('--account-id') || DEFAULT_SEED_OPTIONS.accountId,
    accountName: DEFAULT_SEED_OPTIONS.accountName,
    campaignCount: readInt('--campaigns', DEFAULT_SEED_OPTIONS.campaignCount),
    countryCode: args.get('--country') || DEFAULT_SEED_OPTIONS.countryCode,
    dayCount: readInt('--days', DEFAULT_SEED_OPTIONS.dayCount),
    merchbaseUserId: args.get('--merchbase-user-id') || DEFAULT_SEED_OPTIONS.merchbaseUserId,
    now,
    seed: args.get('--seed') || DEFAULT_SEED_OPTIONS.seed,
};

const startedAt = Date.now();
await runMigrations();

const client = postgres({
    database: databaseConfig.name,
    host: databaseConfig.host,
    max: 1,
    password: databaseConfig.password,
    port: databaseConfig.port,
    username: databaseConfig.user,
});

try {
    const plan = buildDevSeedPlan(options);
    // No schema is handed to Drizzle: the writer only inserts and deletes, so
    // the relational query builder it would power is never used.
    await writeDevSeedPlan(drizzle(client) as unknown as SeedDatabase, plan);

    console.log(
        JSON.stringify(
            {
                accountId: plan.accountId,
                countryCode: plan.countryCode,
                dayCount: options.dayCount,
                durationMs: Date.now() - startedAt,
                merchbaseUserId: plan.merchbaseUserId,
                rows: plan.summary,
                seed: options.seed,
                target: describeTarget(target),
                timezone: plan.timezone,
                totalRows: Object.values(plan.summary).reduce((sum, count) => sum + count, 0),
            },
            null,
            2
        )
    );
} finally {
    await client.end();
}

function readInt(name: string, fallback: number) {
    const raw = args.get(name);
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!(Number.isFinite(parsed) && parsed > 0)) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return parsed;
}
