import type { FastifyInstance } from 'fastify';
import { syncAdvertiserAccountsJob } from '@/jobs/sync-advertiser-accounts.js';

export function registerSyncAdvertiserAccountsRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/sync-advertiser-accounts', async (_request, _reply) => {
        await syncAdvertiserAccountsJob.emit({});

        return { success: true, message: 'Sync advertiser accounts job queued' };
    });
}
