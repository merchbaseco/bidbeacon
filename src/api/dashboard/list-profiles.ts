import type { FastifyInstance } from 'fastify';
import { listProfiles } from '@/amazon-ads/list-profiles.js';

export function registerListProfilesRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/list-profiles', async (_request, _reply) => {
        const profiles = await listProfiles(undefined, 'na');

        return { success: true, data: profiles };
    });
}
