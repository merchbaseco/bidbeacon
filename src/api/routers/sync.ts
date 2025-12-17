import { z } from 'zod';
import { syncAdEntitiesJob } from '@/jobs/sync-ad-entities.js';
import { publicProcedure, router } from '../trpc.js';

export const syncRouter = router({
    triggerAdEntities: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ input }) => {
            const jobId = await syncAdEntitiesJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            console.log(`[API] Sync ad entities job queued with ID: ${jobId}`);
            return { success: true, message: 'Sync job queued' };
        }),
});
