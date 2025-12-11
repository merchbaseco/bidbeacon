import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';
import {
    reprocessReportDatasetMetadataJob,
    updateReportDatasetMetadataJob,
} from '@/jobs/update-report-dataset-metadata.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export async function registerDashboardRoutes(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/status', async (request, _reply) => {
        const querySchema = z.object({
            accountId: z.string().default(DEFAULT_ACCOUNT_ID),
            aggregation: z.enum(['hourly', 'daily']).default('daily'),
            from: z.string().datetime().optional(), // ISO string
            to: z.string().datetime().optional(), // ISO string
        });

        const query = querySchema.parse(request.query);

        // Default to last 30 days if no range provided
        const to = query.to ? new Date(query.to) : new Date();
        const from = query.from
            ? new Date(query.from)
            : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

        const data = await db
            .select()
            .from(reportDatasetMetadata)
            .where(
                and(
                    eq(reportDatasetMetadata.accountId, query.accountId),
                    eq(reportDatasetMetadata.aggregation, query.aggregation),
                    gte(reportDatasetMetadata.timestamp, from),
                    lte(reportDatasetMetadata.timestamp, to)
                )
            )
            .orderBy(desc(reportDatasetMetadata.timestamp));

        return { success: true, data };
    });

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

    fastify.post('/api/dashboard/trigger-update', async (request, _reply) => {
        const bodySchema = z.object({
            accountId: z.string().default(DEFAULT_ACCOUNT_ID),
        });

        const body = bodySchema.parse(request.body);

        await updateReportDatasetMetadataJob.emit({
            accountId: body.accountId,
        });

        return { success: true, message: 'Update job queued' };
    });
}
