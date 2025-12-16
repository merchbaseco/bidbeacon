import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { retrieveReport } from '@/amazon-ads/retrieve-report.js';
import { db } from '@/db/index.js';
import { advertiserAccount, reportDatasetMetadata } from '@/db/schema.js';

export function registerRetrieveReportRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/retrieve-report', async (request, reply) => {
        const bodySchema = z.object({
            accountId: z.string(),
            timestamp: z.string(), // ISO string
            aggregation: z.enum(['hourly', 'daily']),
            entityType: z.enum(['target', 'product']),
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Retrieve report request received: ${body.aggregation}/${body.entityType} for ${body.accountId} at ${body.timestamp}`);

        // Look up report metadata to get reportId
        const metadata = await db.query.reportDatasetMetadata.findFirst({
            where: and(
                eq(reportDatasetMetadata.accountId, body.accountId),
                eq(reportDatasetMetadata.timestamp, new Date(body.timestamp)),
                eq(reportDatasetMetadata.aggregation, body.aggregation),
                eq(reportDatasetMetadata.entityType, body.entityType)
            ),
            columns: {
                reportId: true,
            },
        });

        if (!metadata || !metadata.reportId) {
            reply.status(404);
            return {
                success: false,
                error: 'Report ID not found for this metadata record',
            };
        }

        // Look up advertiser account to get profileId
        const account = await db.query.advertiserAccount.findFirst({
            where: eq(advertiserAccount.adsAccountId, body.accountId),
            columns: {
                profileId: true,
            },
        });

        if (!account) {
            reply.status(404);
            return {
                success: false,
                error: 'Advertiser account not found',
            };
        }

        if (!account.profileId) {
            reply.status(400);
            return {
                success: false,
                error: 'Profile ID not found for this account',
            };
        }

        try {
            const response = await retrieveReport(
                {
                    profileId: Number(account.profileId),
                    reportIds: [metadata.reportId],
                },
                'na' // Default to North America region
            );

            return {
                success: true,
                data: response,
            };
        } catch (error) {
            console.error('[API] Failed to retrieve report:', error);
            reply.status(500);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to retrieve report',
            };
        }
    });
}
