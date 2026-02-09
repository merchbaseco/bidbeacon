import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { apiProcedure, router } from '@/api/trpc';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { syncAdEntitiesJob } from '@/jobs/sync-ad-entities';

export const accountsApiRouter = router({
    list: apiProcedure.query(async ({ ctx }) => {
        if (ctx.accessibleAccountIds.length === 0) {
            return [];
        }
        return db.select().from(advertiserAccount).where(inArray(advertiserAccount.adsAccountId, ctx.accessibleAccountIds));
    }),

    datasetMetadata: apiProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .query(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            const data = await db.query.accountDatasetMetadata.findFirst({
                where: (metadata, { and, eq }) => and(eq(metadata.accountId, input.accountId), eq(metadata.countryCode, input.countryCode)),
            });

            return data;
        }),

    syncAdEntities: apiProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            await syncAdEntitiesJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            return true;
        }),
});
