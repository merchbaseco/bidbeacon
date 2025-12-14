import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reprocessReportDatasetMetadataJob } from '@/jobs/update-report-dataset-metadata.js';

export function registerReprocessRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/reprocess', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
            timestamp: z.string(), // ISO string
            aggregation: z.enum(['hourly', 'daily']),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Reprocess request received: ${body.aggregation} for ${body.accountId}, country: ${body.countryCode} at ${body.timestamp}`);
        const jobId = await reprocessReportDatasetMetadataJob.emit({
            accountId: body.accountId,
            countryCode: body.countryCode,
            timestamp: body.timestamp,
            aggregation: body.aggregation,
        });
        console.log(`[API] Reprocess job queued with ID: ${jobId}`);

        return { success: true, message: 'Reprocess job queued' };
    });
}
