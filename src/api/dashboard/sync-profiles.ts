import type { FastifyInstance } from 'fastify';
import { syncProfilesJob } from '@/jobs/sync-profiles.js';

export function registerSyncProfilesRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/sync-profiles', async (_request, _reply) => {
        await syncProfilesJob.emit({});

        return { success: true, message: 'Sync profiles job queued' };
    });
}
