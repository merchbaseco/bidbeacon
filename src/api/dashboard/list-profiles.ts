import type { FastifyInstance } from 'fastify';
import { db } from '@/db/index.js';
import { advertiserProfile } from '@/db/schema.js';

export function registerListProfilesRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-profiles', async (_request, _reply) => {
        const data = await db.select().from(advertiserProfile);

        return { success: true, data };
    });
}
