import type { FastifyInstance } from 'fastify';
import { deployedRevision } from '@/health/deployed-revision';
import { assessHealth, type HealthSignals } from '@/health/health-checks';

const healthServiceName = 'bidbeacon-server';

export const registerHealthRoute = (fastify: FastifyInstance, options: { now?: () => Date; pingDatabase: () => Promise<boolean>; readSignals: () => Promise<HealthSignals> }) => {
    fastify.get('/api/live', async (request, reply) => {
        const readNow = options.now ?? defaultNow;
        let databaseOk = false;

        try {
            databaseOk = await options.pingDatabase();
        } catch (error) {
            request.log.error({ err: error }, 'Liveness check failed');
        }

        const timestamp = readNow().toISOString();
        if (!databaseOk) {
            reply.code(503);
            return healthResponse(
                {
                    status: 'degraded' as const,
                    failing: ['database'],
                },
                timestamp
            );
        }

        return healthResponse({ status: 'ok' as const }, timestamp);
    });

    fastify.get('/api/health', async (request, reply) => {
        const readNow = options.now ?? defaultNow;
        let signals: HealthSignals;

        try {
            signals = await options.readSignals();
        } catch (error) {
            request.log.error({ err: error }, 'Health check failed');
            reply.code(503);
            return healthResponse(
                {
                    status: 'degraded' as const,
                    failing: ['database'],
                },
                readNow().toISOString()
            );
        }

        const report = assessHealth(signals);
        const timestamp = signals.observedAt.toISOString();

        switch (report.status) {
            case 'ok':
                return healthResponse({ status: 'ok' as const }, timestamp);
            case 'degraded':
                reply.code(503);
                return healthResponse(
                    {
                        status: 'degraded' as const,
                        failing: report.failing,
                    },
                    timestamp
                );
            default: {
                const unexpected: never = report;
                throw new Error(`Unexpected health status: ${String(unexpected)}`);
            }
        }
    });
};

const defaultNow = () => new Date();

type HealthBodyCore = { status: 'ok' } | { status: 'degraded'; failing: string[] };

const healthResponse = (core: HealthBodyCore, timestamp: string) => ({
    ...core,
    timestamp,
    service: healthServiceName,
    revision: deployedRevision,
});
