import { and, eq, inArray, max, sql } from 'drizzle-orm';
import type { Database } from '@/db/index';
import { jobMetrics, workerControl } from '@/db/schema';
import { type HealthSignals, healthChecks } from '@/health/health-checks';

export const pingDatabase = async (database: Database) => {
    try {
        await database.execute(sql`SELECT 1`);
        return true;
    } catch {
        return false;
    }
};

export const readHealthSignals = async (database: Database, processStartedAt: Date): Promise<HealthSignals> => {
    const observedAt = new Date();

    if (!(await pingDatabase(database))) {
        return {
            at: blankMeasuredAt(),
            databaseOk: false,
            observedAt,
            processStartedAt,
            unread: [],
        };
    }

    const at = blankMeasuredAt();
    const unread: HealthSignals['unread'][number][] = [];

    try {
        const rows = await database
            .select({
                finishedAt: max(jobMetrics.finishedAt),
                jobName: jobMetrics.jobName,
            })
            .from(jobMetrics)
            .where(and(eq(jobMetrics.status, 'succeeded'), inArray(jobMetrics.jobName, jobNames())))
            .groupBy(jobMetrics.jobName);
        const finishedAtByJobName = new Map(rows.map(row => [row.jobName, readTimestamp(row.finishedAt)]));

        for (const check of healthChecks) {
            if (check.kind === 'job') {
                at[check.name] = finishedAtByJobName.get(check.jobName) ?? null;
            }
        }
    } catch {
        for (const check of healthChecks) {
            if (check.kind === 'job') {
                at[check.name] = null;
                unread.push(check.name);
            }
        }
    }

    try {
        const rows = await database.select({ lastPolledAt: workerControl.lastPolledAt }).from(workerControl).where(eq(workerControl.id, 'main')).limit(1);
        const lastPolledAt = readTimestamp(rows[0]?.lastPolledAt ?? null);

        for (const check of healthChecks) {
            if (check.kind === 'poll') {
                at[check.name] = lastPolledAt;
            }
        }
    } catch {
        for (const check of healthChecks) {
            if (check.kind === 'poll') {
                at[check.name] = null;
                unread.push(check.name);
            }
        }
    }

    return {
        at,
        databaseOk: true,
        observedAt,
        processStartedAt,
        unread,
    };
};

const blankMeasuredAt = (): HealthSignals['at'] => {
    const at = {} as HealthSignals['at'];

    for (const check of healthChecks) {
        switch (check.kind) {
            case 'database':
                break;
            case 'job':
            case 'poll':
                at[check.name] = null;
                break;
            default: {
                const unexpected: never = check;
                throw new Error(`Unexpected health check kind: ${String(unexpected)}`);
            }
        }
    }

    return at;
};

const jobNames = () => healthChecks.flatMap(check => (check.kind === 'job' ? [check.jobName] : []));

const readTimestamp = (value: unknown) => {
    if (value === null || value === undefined) {
        return null;
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const timestamp = new Date(value);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    return null;
};
