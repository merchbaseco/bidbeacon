import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type HealthSignals, healthChecks } from '@/health/health-checks';
import { registerHealthRoute } from '@/health/register-health-route';

const observedAt = new Date('2026-10-08T18:00:00.000Z');
const thrownAt = new Date('2026-10-08T18:04:00.000Z');

describe('GET /api/health', () => {
    let app: FastifyInstance | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it('returns 200 and the ok body without an Authorization header', async () => {
        app = Fastify({ logger: false });
        registerHealthRoute(app, {
            now: () => {
                throw new Error('success path must use signals.observedAt');
            },
            readSignals: async () => signals(),
        });
        await app.ready();

        const response = await app.inject({
            headers: {},
            method: 'GET',
            url: '/api/health',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            status: 'ok',
            timestamp: observedAt.toISOString(),
            service: 'bidbeacon-server',
        });
    });

    it('returns 503 and the degraded body', async () => {
        const reportDispatch = measuredChecks.find(check => check.name === 'report-dispatch');
        const amsStream = measuredChecks.find(check => check.name === 'ams-stream');
        if (!(reportDispatch && amsStream)) {
            throw new Error('report-dispatch and ams-stream are missing from the health catalog');
        }

        app = Fastify({ logger: false });
        registerHealthRoute(app, {
            now: () => {
                throw new Error('success path must use signals.observedAt');
            },
            readSignals: async () =>
                signals({
                    at: {
                        'ams-stream': new Date(observedAt.getTime() - amsStream.maxAgeMs),
                        'report-dispatch': new Date(observedAt.getTime() - reportDispatch.maxAgeMs),
                    },
                }),
        });
        await app.ready();

        const response = await app.inject({
            method: 'GET',
            url: '/api/health',
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            status: 'degraded',
            failing: ['report-dispatch', 'ams-stream'],
            timestamp: observedAt.toISOString(),
            service: 'bidbeacon-server',
        });
    });

    it('returns 503 database when reading signals throws', async () => {
        app = Fastify({ logger: false });
        registerHealthRoute(app, {
            now: () => thrownAt,
            readSignals: async () => {
                throw new Error('connect ECONNREFUSED 10.1.2.3 password=secret');
            },
        });
        await app.ready();

        const response = await app.inject({
            method: 'GET',
            url: '/api/health',
        });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
            status: 'degraded',
            failing: ['database'],
            timestamp: thrownAt.toISOString(),
            service: 'bidbeacon-server',
        });
        expect(response.body).not.toContain('10.1.2.3');
        expect(response.body).not.toContain('password=secret');
    });

    it('returns 503 for HEAD when the service is degraded', async () => {
        app = Fastify({ logger: false });
        registerHealthRoute(app, {
            readSignals: async () =>
                signals({
                    databaseOk: false,
                }),
        });
        await app.ready();

        const response = await app.inject({
            method: 'HEAD',
            url: '/api/health',
        });

        expect(response.statusCode).toBe(503);
    });
});

const measuredChecks = healthChecks.filter((check): check is Extract<(typeof healthChecks)[number], { kind: 'job' | 'poll' }> => check.kind === 'job' || check.kind === 'poll');

const signals = (overrides: { at?: Partial<HealthSignals['at']>; databaseOk?: boolean } = {}): HealthSignals => {
    const at = {} as HealthSignals['at'];
    for (const check of measuredChecks) {
        at[check.name] = new Date(observedAt.getTime() - (check.maxAgeMs - 1));
    }

    return {
        at: { ...at, ...overrides.at },
        databaseOk: overrides.databaseOk ?? true,
        observedAt,
        processStartedAt: new Date(observedAt.getTime() - 48 * 60 * 60 * 1000),
        unread: [],
    };
};
