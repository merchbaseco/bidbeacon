import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateReportDatasetMetadataJob } from '@/jobs/update-report-dataset-metadata.js';

export function registerTriggerUpdateRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/trigger-update', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Trigger update request received for account: ${body.accountId}, country: ${body.countryCode}`);
        const jobId = await updateReportDatasetMetadataJob.emit({
            accountId: body.accountId,
            countryCode: body.countryCode,
        });
        console.log(`[API] Update job queued with ID: ${jobId}`);

        return { success: true, message: 'Update job queued' };
    });
}
