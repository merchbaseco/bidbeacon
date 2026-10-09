import { describe, expect, it } from 'vitest';
import { assessHealth, type HealthSignals, healthChecks } from '@/health/health-checks';

const observedAt = new Date('2026-10-08T18:00:00.000Z');

describe('assessHealth', () => {
    it('returns ok when every signal is fresh', () => {
        expect(assessHealth(signals())).toEqual({ status: 'ok' });
    });

    it('returns only database when the database was not measured', () => {
        const at = blankAt();
        const processStartedAt = new Date(observedAt.getTime() - Math.max(...measuredChecks.map(check => check.maxAgeMs)));

        expect(
            assessHealth({
                at,
                databaseOk: false,
                observedAt,
                processStartedAt,
                unread: [],
            })
        ).toEqual({ status: 'degraded', failing: ['database'] });
    });

    it('passes one millisecond inside a limit and fails that check at the limit', () => {
        for (const check of measuredChecks) {
            expect(
                assessHealth(
                    signals({
                        at: {
                            [check.name]: new Date(observedAt.getTime() - (check.maxAgeMs - 1)),
                        },
                    })
                )
            ).toEqual({ status: 'ok' });

            expect(
                assessHealth(
                    signals({
                        at: {
                            [check.name]: new Date(observedAt.getTime() - check.maxAgeMs),
                        },
                    })
                )
            ).toEqual({ status: 'degraded', failing: [check.name] });
        }
    });

    it('treats a missing timestamp as fresh only while the process is younger than the limit', () => {
        for (const check of measuredChecks) {
            expect(
                assessHealth(
                    signals({
                        at: { [check.name]: null },
                        processStartedAt: new Date(observedAt.getTime() - (check.maxAgeMs - 1)),
                    })
                )
            ).toEqual({ status: 'ok' });

            expect(
                assessHealth(
                    signals({
                        at: { [check.name]: null },
                        processStartedAt: new Date(observedAt.getTime() - check.maxAgeMs),
                    })
                )
            ).toEqual({ status: 'degraded', failing: [check.name] });
        }
    });

    it('fails an old timestamp while the process is young', () => {
        const check = measuredChecks.find(candidate => candidate.name === 'report-dispatch');
        if (!check) {
            throw new Error('report-dispatch is missing from the health catalog');
        }

        expect(
            assessHealth(
                signals({
                    at: {
                        [check.name]: new Date(observedAt.getTime() - check.maxAgeMs),
                    },
                    processStartedAt: observedAt,
                })
            )
        ).toEqual({ status: 'degraded', failing: ['report-dispatch'] });
    });

    it('lists two failures in catalog order', () => {
        const reportDatasets = measuredChecks.find(candidate => candidate.name === 'report-datasets');
        const campaignSync = measuredChecks.find(candidate => candidate.name === 'campaign-sync');
        if (!(reportDatasets && campaignSync)) {
            throw new Error('report-datasets and campaign-sync are missing from the health catalog');
        }

        expect(
            assessHealth(
                signals({
                    at: {
                        'campaign-sync': new Date(observedAt.getTime() - campaignSync.maxAgeMs),
                        'report-datasets': new Date(observedAt.getTime() - reportDatasets.maxAgeMs),
                    },
                })
            )
        ).toEqual({ status: 'degraded', failing: ['report-datasets', 'campaign-sync'] });
    });

    it('fails an unread check even when its timestamp is fresh and the process is young', () => {
        expect(
            assessHealth(
                signals({
                    processStartedAt: observedAt,
                    unread: ['hourly-performance'],
                })
            )
        ).toEqual({ status: 'degraded', failing: ['hourly-performance'] });
    });
});

const measuredChecks = healthChecks.filter((check): check is Extract<(typeof healthChecks)[number], { kind: 'job' | 'poll' }> => check.kind === 'job' || check.kind === 'poll');

const blankAt = () => {
    const at = {} as HealthSignals['at'];
    for (const check of measuredChecks) {
        at[check.name] = null;
    }
    return at;
};

const signals = (overrides: { at?: Partial<HealthSignals['at']>; processStartedAt?: Date; unread?: HealthSignals['unread'] } = {}): HealthSignals => {
    const at = {} as HealthSignals['at'];
    for (const check of measuredChecks) {
        at[check.name] = new Date(observedAt.getTime() - (check.maxAgeMs - 1));
    }

    return {
        at: { ...at, ...overrides.at },
        databaseOk: true,
        observedAt,
        processStartedAt: overrides.processStartedAt ?? new Date(observedAt.getTime() - 48 * 60 * 60 * 1000),
        unread: overrides.unread ?? [],
    };
};
