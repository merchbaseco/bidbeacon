/**
 * The dev seed writes fabricated campaigns, bids, and performance rows. "Not
 * production" is not a safe test for where it may run: `.env.schema` points the
 * development arm of `BIDBEACON_DATABASE_HOST` at the Mac mini over Tailscale,
 * and that host serves the real database every local `bun run dev` session
 * talks to. The only structurally safe target is a PostgreSQL running on this
 * machine, so the guard allows loopback and refuses everything else — every
 * hostname that could resolve off-box included. There is no override flag.
 */

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '::1', 'localhost']);
const IPV6_BRACKETS = /^\[|\]$/gu;

export interface SeedDatabaseTarget {
    database: string;
    host: string;
    port: number;
}

export class SeedTargetRefusedError extends Error {
    constructor(reason: string, target: string) {
        super(
            [
                'Refusing to seed: the dev seed only runs against a local database.',
                `Reason: ${reason}`,
                `Target: ${target}`,
                'BIDBEACON_DATABASE_HOST must be 127.0.0.1, ::1, or localhost.',
                'Local development resolves to the shared BidBeacon database over Tailscale, which this seed must never touch.',
                'Start a PostgreSQL on this machine and override the host for the run, for example: BIDBEACON_DATABASE_HOST=127.0.0.1 bun run db:seed:dev',
            ].join('\n')
        );
        this.name = 'SeedTargetRefusedError';
    }
}

export const assertLocalSeedTarget = (input: { database?: string; host?: string; nodeEnv?: string; port?: string | number }): SeedDatabaseTarget => {
    const target = readTarget(input);

    if (input.nodeEnv === 'production') {
        throw new SeedTargetRefusedError('NODE_ENV is production', describeTarget(target));
    }

    if (!LOOPBACK_HOSTNAMES.has(target.host)) {
        throw new SeedTargetRefusedError(`database host ${target.host} is not loopback`, describeTarget(target));
    }

    return target;
};

export const describeTarget = (target: SeedDatabaseTarget) => `${target.host}:${target.port}/${target.database}`;

const readTarget = (input: { database?: string; host?: string; port?: string | number }): SeedDatabaseTarget => {
    const host = input.host?.trim().replace(IPV6_BRACKETS, '').toLowerCase();
    if (!host) {
        throw new SeedTargetRefusedError('BIDBEACON_DATABASE_HOST is not set', '(unknown)');
    }

    const port = Number(input.port ?? 5432);

    return {
        database: input.database?.trim() || '(none)',
        host,
        port: Number.isFinite(port) ? port : 5432,
    };
};
