import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@/db/index.js';
import { advertiserAccount } from '@/db/schema.js';

export function registerToggleAdvertiserAccountRoute(fastify: FastifyInstance) {
    fastify.post('/api/dashboard/toggle-advertiser-account', async (request, _reply) => {
        const bodySchema = z.object({
            id: z.string().uuid(), // UUID of the advertiser account row
            enabled: z.boolean(), // New enabled status
        });

        const body = bodySchema.parse(request.body);
        console.log(
            `[API] Toggle advertiser account request: ${body.id} -> ${body.enabled ? 'enabled' : 'disabled'}`
        );

        // Update the enabled status for the specific account row
        await db
            .update(advertiserAccount)
            .set({ enabled: body.enabled })
            .where(eq(advertiserAccount.id, body.id));

        console.log(
            `[API] Account ${body.id} ${body.enabled ? 'enabled' : 'disabled'} successfully`
        );
        return { success: true, message: `Account ${body.enabled ? 'enabled' : 'disabled'}` };
    });
}
