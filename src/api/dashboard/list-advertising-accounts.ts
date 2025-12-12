import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';

export function registerListAdvertisingAccountsRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-advertising-accounts', async (_request, _reply) => {
        console.log('[API] List advertising accounts request received');
        const data = await db.select().from(advertiserAccount);
        console.log(`[API] Returning ${data.length} advertising account(s)`);

        return { success: true, data };
    });
}
