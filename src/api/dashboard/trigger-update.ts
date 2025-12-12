import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateReportDatasetMetadataJob } from '@/jobs/update-report-dataset-metadata.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export function registerTriggerUpdateRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/trigger-update', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string().default(DEFAULT_ACCOUNT_ID),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Trigger update request received for account: ${body.accountId}`);
        const jobId = await updateReportDatasetMetadataJob.emit({
            accountId: body.accountId,
        });
        console.log(`[API] Update job queued with ID: ${jobId}`);

        return { success: true, message: 'Update job queued' };
    });
}
