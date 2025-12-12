import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';

export function registerListAdvertisingAccountsRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-advertising-accounts', async (_request, _reply) => {
        const data = await db.select().from(advertiserAccount);

        return { success: true, data };
    });
}
