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
 *
 * It prints a receipt on stdout — database target, the Clerk subject and
 * Merchbase User the data is granted to, row counts, and the day the week runs
 * through — because a boot that says nothing is indistinguishable from a boot
 * that seeded nothing. Nothing in the receipt is a credential.
 */

import { bootstrapDevAccessProjection, DEV_SIGN_IN_MERCHBASE_USER_ID } from '@merchbaseco/access/dev';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseConfig } from '@/db/database-config';
import type { Database } from '@/db/index';
import { runMigrations } from '@/db/migrate';
import { assertLocalSeedTarget, describeTarget, type SeedDatabaseTarget } from '@/dev-seed/local-database-guard';
import { buildDevSeedPlan, DEFAULT_SEED_OPTIONS } from '@/dev-seed/plan';
import { type SeedDatabase, writeDevSeedPlan } from '@/dev-seed/write-plan';
import { createAccessProjectionStore } from '@/services/access/access-projection-store';

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
    // The seed's own single connection stands in for the process-wide `db`.
    // Neither consumer needs the relational query builder a schema would power:
    // the projection store inserts, selects, and opens a transaction, and the
    // writer only inserts and deletes. Importing `@/db/index` for its type
    // costs nothing; importing its value would open a second pool that outlives
    // this script.
    const database = drizzle(client) as unknown as Database;

    // Before any product row, because product rows are unreachable without it.
    // BidBeacon authorizes against a webhook-synced Access Projection, and a
    // freshly migrated local database has never received a Clerk webhook — so
    // every request from the signed-in dev user would 403 before it could see a
    // single seeded campaign. The shared package writes the projection the
    // webhook would have written, through this repo's own store adapter and the
    // same `apply` upsert the webhook route uses. No projection SQL lives here.
    const access = await bootstrapDevAccessProjection({
        databaseUrl: toDatabaseUrl(target),
        // Byte-identical to the value `createClerkAuthenticator` is given in
        // `src/services/access/bidbeacon-access.ts`: a projection is keyed by
        // (issuer, subject), so an issuer that differs by a character writes a
        // row no session will ever match.
        issuer: requireEnvironment('MERCHBASE_CLERK_ISSUER'),
        service: 'bidbeacon',
        store: createAccessProjectionStore(database),
    });

    const plan = buildDevSeedPlan(options);
    await writeDevSeedPlan(database as unknown as SeedDatabase, plan);

    const receipt = {
        access: {
            clerkSubject: access.clerkSubject,
            issuer: access.issuer,
            merchbaseUserId: access.merchbaseUserId,
            service: access.service,
        },
        accountId: plan.accountId,
        countryCode: plan.countryCode,
        dayCount: options.dayCount,
        durationMs: Date.now() - startedAt,
        fromDay: plan.fromDay,
        merchbaseUserId: plan.merchbaseUserId,
        rows: plan.summary,
        seed: options.seed,
        target: describeTarget(target),
        throughDay: plan.throughDay,
        timezone: plan.timezone,
        totalRows: Object.values(plan.summary).reduce((sum, count) => sum + count, 0),
    };

    // A skimmable line for a boot log, then the full receipt for anything that
    // wants to read it.
    console.log(
        `[seed] ${receipt.totalRows} rows into ${receipt.target} through ${receipt.throughDay} (${plan.timezone}), granted to ${plan.merchbaseUserId}` +
            (plan.merchbaseUserId === DEV_SIGN_IN_MERCHBASE_USER_ID ? ' (shared Dev Sign-In user)' : '')
    );
    console.log(JSON.stringify(receipt, null, 2));
} finally {
    await client.end();
}

/**
 * A credential-free DSN. The bootstrap reads it only to prove the target is
 * loopback, so the password is deliberately left out rather than trusted not to
 * be logged.
 */
function toDatabaseUrl(seedTarget: SeedDatabaseTarget) {
    const host = seedTarget.host.includes(':') ? `[${seedTarget.host}]` : seedTarget.host;
    return `postgres://${host}:${seedTarget.port}/${seedTarget.database}`;
}

function requireEnvironment(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required for Merchbase Access.`);
    }
    return value;
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
