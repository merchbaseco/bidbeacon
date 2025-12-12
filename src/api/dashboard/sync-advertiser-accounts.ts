import type { FastifyInstance } from 'fastify';
import { syncAdvertiserAccountsJob } from '@/jobs/sync-advertiser-accounts.js';

export function registerSyncAdvertiserAccountsRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/sync-advertiser-accounts', async (_request, _reply) => {
        console.log('[API] Sync advertiser accounts request received');
        const jobId = await syncAdvertiserAccountsJob.emit({});
        console.log(`[API] Sync advertiser accounts job queued with ID: ${jobId}`);

        return { success: true, message: 'Sync advertiser accounts job queued' };
    });
}
