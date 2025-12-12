import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reprocessReportDatasetMetadataJob } from '@/jobs/update-report-dataset-metadata.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export function registerReprocessRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/reprocess', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string().default(DEFAULT_ACCOUNT_ID),
            timestamp: z.string(), // ISO string
            aggregation: z.enum(['hourly', 'daily']),
        });

        const body = bodySchema.parse(request.body);

        await reprocessReportDatasetMetadataJob.emit({
            accountId: body.accountId,
            timestamp: body.timestamp,
            aggregation: body.aggregation,
        });

        return { success: true, message: 'Reprocess job queued' };
    });
}
