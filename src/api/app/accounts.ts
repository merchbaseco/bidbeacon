import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount } from '@/db/schema';
import { syncAdEntitiesForAccountJob } from '@/jobs/sync-ad-entities-for-account';
import { expandAdvertiserAccountMemberships } from '@/services/access/advertiser-account-memberships';
import { privateProcedure, router } from '../trpc';

export const accountsRouter = router({
    list: privateProcedure.query(async ({ ctx }) => {
        // Filter to only return accounts the user has access to
        if (ctx.accessibleAccountIds.length === 0) {
            return [];
        }
        return db.select().from(advertiserAccount).where(inArray(advertiserAccount.adsAccountId, ctx.accessibleAccountIds));
    }),

    toggle: privateProcedure
        .input(
            z.object({
                adsAccountId: z.string(),
                profileId: z.string(),
                enabled: z.boolean(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.adsAccountId);

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

    sync: privateProcedure.mutation(async ({ ctx }) => {
        const { listAdvertiserAccounts } = await import('@/amazon-ads/list-advertiser-accounts');

        const result = await listAdvertiserAccounts(undefined, 'na');

        for (const account of result.adsAccounts) {
            for (const countryCode of account.countryCodes) {
                const profileId = account.alternateIds.find(id => id.countryCode === countryCode && id.profileId !== undefined)?.profileId;
                const entityId = account.alternateIds.find(id => id.countryCode === countryCode && id.entityId !== undefined)?.entityId;

                if (!(profileId && entityId)) {
                    continue;
                }

                const [existingAccount] = await db
                    .select({ id: advertiserAccount.id })
                    .from(advertiserAccount)
                    .where(and(eq(advertiserAccount.adsAccountId, account.adsAccountId), eq(advertiserAccount.profileId, profileId.toString())))
                    .limit(1);

                let advertiserAccountId = existingAccount?.id;
                if (!advertiserAccountId) {
                    const [createdAccount] = await db
                        .insert(advertiserAccount)
                        .values({
                            adsAccountId: account.adsAccountId,
                            accountName: account.accountName,
                            status: account.status,
                            countryCode,
                            profileId: profileId.toString(),
                            entityId,
                        })
                        .onConflictDoNothing()
                        .returning({ id: advertiserAccount.id });
                    advertiserAccountId = createdAccount?.id;
                }

                if (!advertiserAccountId) {
                    const [concurrentAccount] = await db
                        .select({ id: advertiserAccount.id })
                        .from(advertiserAccount)
                        .where(and(eq(advertiserAccount.adsAccountId, account.adsAccountId), eq(advertiserAccount.profileId, profileId.toString())))
                        .limit(1);
                    advertiserAccountId = concurrentAccount?.id;
                }

                if (!advertiserAccountId) {
                    continue;
                }

                await expandAdvertiserAccountMemberships(db, {
                    actorMerchbaseUserId: ctx.user.merchbaseUserId,
                    advertiserAccountId,
                    adsAccountId: account.adsAccountId,
                });
            }
        }

        return true;
    }),

    datasetMetadata: privateProcedure
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

    syncAdEntities: privateProcedure
        .input(
            z.object({
                accountId: z.string(),
                countryCode: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            ctx.assertAccountAccess(input.accountId);

            await syncAdEntitiesForAccountJob.emit({
                accountId: input.accountId,
                countryCode: input.countryCode,
            });
            return true;
        }),
});
