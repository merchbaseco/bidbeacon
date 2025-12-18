import { z } from 'zod';
import { syncAdEntitiesJob } from '@/jobs/sync-ad-entities';
import { logger } from '@/utils/logger';
import { publicProcedure, router } from '../trpc';

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
            logger.info({ accountId: input.accountId, countryCode: input.countryCode, jobId }, 'Sync ad entities job queued');
            return { success: true, message: 'Sync job queued' };
        }),
});
