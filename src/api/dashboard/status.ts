import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { reportDatasetMetadata } from '@/db/schema.js';

const DEFAULT_ACCOUNT_ID = 'amzn1.ads-account.g.akzidxc3kemvnyklo33ht2mjm';

export function registerStatusRoute(fastify: FastifyInstance) {
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
}
