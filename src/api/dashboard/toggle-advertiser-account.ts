import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';

export function registerToggleAdvertiserAccountRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/toggle-advertiser-account', async (request, _reply) => {
        const bodySchema = z.object({
            adsAccountId: z.string(), // adsAccountId (e.g., "amzn1.ads-account.g.38rle97xonvbq66bhw6gsyl4g")
            profileId: z.string(), // profileId from alternateIds
            enabled: z.boolean(), // New enabled status
        });

        const body = bodySchema.parse(request.body);
        console.log(`[API] Toggle advertiser account request: ${body.adsAccountId}/${body.profileId} -> ${body.enabled ? 'enabled' : 'disabled'}`);

        // Update the enabled status for the specific account row identified by adsAccountId + profileId
        await db
            .update(advertiserAccount)
            .set({ enabled: body.enabled })
            .where(and(eq(advertiserAccount.adsAccountId, body.adsAccountId), eq(advertiserAccount.profileId, body.profileId)));

        console.log(`[API] Account ${body.adsAccountId}/${body.profileId} ${body.enabled ? 'enabled' : 'disabled'} successfully`);

        return { success: true, message: `Account ${body.enabled ? 'enabled' : 'disabled'}` };
    });
}
