import type { FastifyInstance } from 'fastify';
import { assessHealth, type HealthSignals } from '@/health/health-checks';

const healthServiceName = 'bidbeacon-server';

export const registerHealthRoute = (fastify: FastifyInstance, options: { now?: () => Date; readSignals: () => Promise<HealthSignals> }) => {
    fastify.get('/api/health', async (request, reply) => {
        const readNow = options.now ?? defaultNow;
        let signals: HealthSignals;

        try {
            signals = await options.readSignals();
        } catch (error) {
            request.log.error({ err: error }, 'Health check failed');
            reply.code(503);
            return {
                status: 'degraded' as const,
                failing: ['database'],
                timestamp: readNow().toISOString(),
                service: healthServiceName,
            };
        }

        const report = assessHealth(signals);
        const timestamp = signals.observedAt.toISOString();

        switch (report.status) {
            case 'ok':
                return {
                    status: 'ok' as const,
                    timestamp,
                    service: healthServiceName,
                };
            case 'degraded':
                reply.code(503);
                return {
                    status: 'degraded' as const,
                    failing: report.failing,
                    timestamp,
                    service: healthServiceName,
                };
            default: {
                const unexpected: never = report;
                throw new Error(`Unexpected health status: ${String(unexpected)}`);
            }
        }
    });
};

const defaultNow = () => new Date();
