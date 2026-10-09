import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { assessHealth, type HealthSignals, healthChecks } from '@/health/health-checks';
import { registerHealthRoute } from '@/health/register-health-route';

const compose = readFileSync(new URL('../../compose.yml', import.meta.url), 'utf8');
const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const deployWorkflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');

const observedAt = new Date('2026-10-08T18:00:00.000Z');

describe('cold start after a long outage', () => {
    it('keeps container health on liveness while freshness stays failed', async () => {
        const report = assessHealth(staleAfterOutage());

        expect(report).toEqual({
            status: 'degraded',
            failing: ['campaign-sync', 'ams-stream'],
        });

        const app = Fastify({ logger: false });
        registerHealthRoute(app, {
            now: () => observedAt,
            pingDatabase: async () => true,
            readSignals: async () => staleAfterOutage(),
        });
        await app.ready();
        const live = await app.inject({ method: 'GET', url: '/api/live' });
        const liveHead = await app.inject({ method: 'HEAD', url: '/api/live' });
        const health = await app.inject({ method: 'GET', url: '/api/health' });
        await app.close();

        expect(live.statusCode).toBe(200);
        expect(live.json()).toEqual({
            status: 'ok',
            timestamp: observedAt.toISOString(),
            service: 'bidbeacon-server',
        });
        expect(liveHead.statusCode).toBe(200);
        expect(health.statusCode).toBe(503);
        expect(health.json()).toEqual({
            status: 'degraded',
            failing: ['campaign-sync', 'ams-stream'],
            timestamp: observedAt.toISOString(),
            service: 'bidbeacon-server',
        });

        const server = serviceBlock('server', '\n  worker:\n');
        const worker = serviceBlock('worker', '\n  caddy:\n');
        const caddy = serviceBlock('caddy', '\nvolumes:\n');

        expect(server).toContain("fetch('http://127.0.0.1:8080/api/live')");
        expect(server).not.toContain('/api/health');
        expect(worker).toContain('condition: service_healthy');
        expect(worker).toContain('["CMD", "node", "dist/worker-healthcheck.js"]');
        expect(worker).not.toContain('/api/health');
        expect(worker).not.toContain('/api/live');
        expect(caddy).toContain('condition: service_healthy');
        expect(caddy).toContain('http://localhost/api/live');
        expect(caddy).not.toContain('/api/health');
        expect(dockerfile).toContain("fetch('http://127.0.0.1:8080/api/live')");
        expect(dockerfile).not.toContain('/api/health');
        expect(deployWorkflow).toContain('https://bidbeacon.merchbase.co/api/live');
        expect(deployWorkflow).not.toContain('/api/health');
    });
});

const serviceBlock = (service: string, nextMarker: string) => {
    const start = compose.indexOf(`\n  ${service}:\n`);
    const end = compose.indexOf(nextMarker, start);
    if (start < 0 || end < 0) {
        throw new Error(`Could not isolate ${service} before ${nextMarker} in compose.yml.`);
    }
    return compose.slice(start, end);
};

const staleAfterOutage = (): HealthSignals => {
    const at = {} as HealthSignals['at'];
    for (const check of measuredChecks) {
        at[check.name] = new Date(observedAt.getTime() - (check.maxAgeMs - 1));
    }

    const campaignSync = measuredChecks.find(check => check.name === 'campaign-sync');
    const amsStream = measuredChecks.find(check => check.name === 'ams-stream');
    if (!(campaignSync && amsStream)) {
        throw new Error('campaign-sync and ams-stream are missing from the health catalog');
    }

    at['campaign-sync'] = new Date(observedAt.getTime() - campaignSync.maxAgeMs - 1);
    at['ams-stream'] = new Date(observedAt.getTime() - amsStream.maxAgeMs - 1);

    return {
        at,
        databaseOk: true,
        observedAt,
        processStartedAt: observedAt,
        unread: [],
    };
};

const measuredChecks = healthChecks.filter((check): check is Extract<(typeof healthChecks)[number], { kind: 'job' | 'poll' }> => check.kind === 'job' || check.kind === 'poll');
