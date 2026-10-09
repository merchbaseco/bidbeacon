export const healthChecks = [
    { name: 'database', kind: 'database' },
    { name: 'report-dispatch', kind: 'job', jobName: 'dispatch-due-reports', maxAgeMs: 10 * 60 * 1000 },
    { name: 'report-datasets', kind: 'job', jobName: 'update-report-datasets', maxAgeMs: 20 * 60 * 1000 },
    { name: 'hourly-performance', kind: 'job', jobName: 'summarize-hourly-target-stream', maxAgeMs: 20 * 60 * 1000 },
    { name: 'daily-performance', kind: 'job', jobName: 'summarize-daily-target-stream', maxAgeMs: 60 * 60 * 1000 },
    { name: 'campaign-sync', kind: 'job', jobName: 'sync-ad-entities', maxAgeMs: 36 * 60 * 60 * 1000 },
    { name: 'change-history', kind: 'job', jobName: 'sync-change-history', maxAgeMs: 3 * 60 * 60 * 1000 },
    { name: 'ams-stream', kind: 'poll', maxAgeMs: 5 * 60 * 1000 },
] as const;

type HealthCheck = (typeof healthChecks)[number];

type HealthCheckName = HealthCheck['name'];

type MeasuredHealthCheckName = Exclude<HealthCheckName, 'database'>;

export type HealthSignals = {
    at: Record<MeasuredHealthCheckName, Date | null>;
    databaseOk: boolean;
    observedAt: Date;
    processStartedAt: Date;
    unread: readonly HealthCheckName[];
};

type HealthReport = { status: 'ok' } | { status: 'degraded'; failing: [HealthCheckName, ...HealthCheckName[]] };

export const assessHealth = (signals: HealthSignals): HealthReport => {
    if (!signals.databaseOk) {
        return { status: 'degraded', failing: ['database'] };
    }

    const failing: HealthCheckName[] = [];
    for (const check of healthChecks) {
        switch (check.kind) {
            case 'database':
                if (signals.unread.includes(check.name)) {
                    failing.push(check.name);
                }
                break;
            case 'job':
            case 'poll':
                if (signals.unread.includes(check.name) || !isFresh(signals, check.maxAgeMs, signals.at[check.name])) {
                    failing.push(check.name);
                }
                break;
            default: {
                const unexpected: never = check;
                throw new Error(`Unexpected health check kind: ${String(unexpected)}`);
            }
        }
    }

    return toHealthReport(failing);
};

const isFresh = (signals: HealthSignals, maxAgeMs: number, at: Date | null) => {
    if (at === null) {
        return signals.observedAt.getTime() - signals.processStartedAt.getTime() < maxAgeMs;
    }

    return signals.observedAt.getTime() - at.getTime() < maxAgeMs;
};

const toHealthReport = (failing: HealthCheckName[]): HealthReport => {
    const [first, ...rest] = failing;
    if (first === undefined) {
        return { status: 'ok' };
    }

    return { status: 'degraded', failing: [first, ...rest] };
};
