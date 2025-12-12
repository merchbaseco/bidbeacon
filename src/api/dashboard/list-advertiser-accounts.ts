import type { FastifyInstance } from 'fastify';
import { listAdvertiserAccounts } from '@/amazon-ads/list-advertiser-accounts.js';

export function registerListAdvertiserAccountsRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-advertiser-accounts', async (_request, _reply) => {
        console.log('[API] List advertiser accounts request received');
        const result = await listAdvertiserAccounts(undefined, 'na');
        console.log(`[API] Returning ${result.adsAccounts.length} advertiser account(s)`);

        return { success: true, data: result };
    });
}
