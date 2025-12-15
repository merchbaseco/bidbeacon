import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { syncAdEntitiesJob } from '@/jobs/sync-ad-entities.js';

export function registerTriggerSyncAdEntitiesRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/trigger-sync-ad-entities', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Trigger sync ad entities request received for account: ${body.accountId}, country: ${body.countryCode}`);
        const jobId = await syncAdEntitiesJob.emit({
            accountId: body.accountId,
            countryCode: body.countryCode,
        });
        console.log(`[API] Sync ad entities job queued with ID: ${jobId}`);

        return { success: true, message: 'Sync ad entities job queued' };
    });
}
