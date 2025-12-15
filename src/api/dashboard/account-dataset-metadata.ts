import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';

export function registerAccountDatasetMetadataRoute(fastify: FastifyInstance) {
    fastify.get('/api/dashboard/account-dataset-metadata', async (request, _reply) => {
        const querySchema = z.object({
            accountId: z.string(),
            countryCode: z.string(),
        });

        const query = querySchema.parse(request.query);
        console.log(`[API] Account dataset metadata request for account: ${query.accountId}, country: ${query.countryCode}`);

        const data = await db.query.accountDatasetMetadata.findFirst({
            where: (metadata, { and, eq }) => and(eq(metadata.accountId, query.accountId), eq(metadata.countryCode, query.countryCode)),
        });

        console.log(`[API] Returning account dataset metadata: ${data ? 'found' : 'not found'}`);
        return { success: true, data };
    });
}
