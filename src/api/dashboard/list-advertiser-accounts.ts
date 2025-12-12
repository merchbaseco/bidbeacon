import type { FastifyInstance } from 'fastify';
import { listAdvertiserAccounts } from '@/amazon-ads/list-advertiser-accounts.js';

export function registerListAdvertiserAccountsRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-advertiser-accounts', async (_request, _reply) => {
        const result = await listAdvertiserAccounts(undefined, 'na');

        return { success: true, data: result };
    });
}
