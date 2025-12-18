import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { syncAdEntitiesJob } from '@/jobs/sync-ad-entities';
import { publicProcedure, router } from '../trpc';

export const accountsRouter = router({
    list: publicProcedure.query(async () => {
        return db.select().from(advertiserAccount);
    }),

    toggle: publicProcedure
        .input(
            z.object({
                adsAccountId: z.string(),
                profileId: z.string(),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ input }) => {
            await db
                .update(advertiserAccount)
                .set({ enabled: input.enabled })
                .where(and(eq(advertiserAccount.adsAccountId, input.adsAccountId), eq(advertiserAccount.profileId, input.profileId)));

            const { emitEvent } = await import('@/utils/events');
            emitEvent({
                type: 'account:updated',
                accountId: input.adsAccountId,
                enabled: input.enabled,
            });

            return true;
        }),

    sync: publicProcedure.mutation(async () => {
        const { listAdvertiserAccounts } = await import('@/amazon-ads/list-advertiser-accounts');

        const result = await listAdvertiserAccounts(undefined, 'na');

        for (const account of result.adsAccounts) {
            for (const countryCode of account.countryCodes) {
                const profileId = account.alternateIds.find(id => id.countryCode === countryCode && id.profileId !== undefined)?.profileId;
                const entityId = account.alternateIds.find(id => id.countryCode === countryCode && id.entityId !== undefined)?.entityId;

                if (!profileId || !entityId) {
                    continue;
                }

                const existingAccount = await db
                    .select()
                    .from(advertiserAccount)
                    .where(and(eq(advertiserAccount.adsAccountId, account.adsAccountId), eq(advertiserAccount.profileId, profileId.toString())))
                    .limit(1);

                if (existingAccount.length > 0) {
                    continue;
                }

                await db.insert(advertiserAccount).values({
                    adsAccountId: account.adsAccountId,
                    accountName: account.accountName,
                    status: account.status,
                    countryCode: countryCode,
                    profileId: profileId.toString(),
                    entityId: entityId,
                });
            }
        }

        return true;
    }),

    datasetMetadata: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .query(async ({ input }) => {
            const data = await db.query.accountDatasetMetadata.findFirst({
                where: (metadata, { and, eq }) => and(eq(metadata.accountId, input.accountId), eq(metadata.countryCode, input.countryCode)),
            });

            return data;
        }),

    syncAdEntities: publicProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ input }) => {
            await syncAdEntitiesJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            return true;
        }),
});
