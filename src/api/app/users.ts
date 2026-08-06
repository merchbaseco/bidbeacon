import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, userAccountAccess, userPreferences } from '@/db/schema';
import { privateProcedure, router } from '../trpc';

export const usersRouter = router({
    me: privateProcedure.query(async ({ ctx }) => {
        return {
            merchbaseUserId: ctx.user.merchbaseUserId,
            accessibleAccountIds: ctx.accessibleAccountIds,
        };
    }),

    linkAccount: privateProcedure.input(z.object({ adsAccountId: z.string() })).mutation(async ({ ctx, input }) => {
        // Verify the account exists
        const accounts = await db.query.advertiserAccount.findMany({
            where: eq(advertiserAccount.adsAccountId, input.adsAccountId),
        });

        if (accounts.length === 0) {
            throw new Error('Account not found');
        }

        await db
            .insert(userAccountAccess)
            .values(accounts.map(account => ({ advertiserAccountId: account.id, merchbaseUserId: ctx.user.merchbaseUserId, adsAccountId: account.adsAccountId })))
            .onConflictDoNothing();

        return true;
    }),

    unlinkAccount: privateProcedure.input(z.object({ adsAccountId: z.string() })).mutation(async ({ ctx, input }) => {
        const accounts = await db.select({ id: advertiserAccount.id }).from(advertiserAccount).where(eq(advertiserAccount.adsAccountId, input.adsAccountId));

        if (accounts.length > 0) {
            await db.delete(userAccountAccess).where(
                and(
                    eq(userAccountAccess.merchbaseUserId, ctx.user.merchbaseUserId),
                    inArray(
                        userAccountAccess.advertiserAccountId,
                        accounts.map(account => account.id)
                    )
                )
            );
        }

        return true;
    }),

    getSelectedAccount: privateProcedure.query(async ({ ctx }) => {
        const prefs = await db.query.userPreferences.findFirst({
            where: eq(userPreferences.merchbaseUserId, ctx.user.merchbaseUserId),
        });

        if (!prefs?.selectedAdsAccountId) {
            return null;
        }

        // Verify user still has access to this account
        if (!ctx.accessibleAccountIds.includes(prefs.selectedAdsAccountId)) {
            return null;
        }

        return {
            adsAccountId: prefs.selectedAdsAccountId,
            profileId: prefs.selectedProfileId,
        };
    }),

    setSelectedAccount: privateProcedure
        .input(
            z.object({
                adsAccountId: z.string(),
                profileId: z.string(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Verify user has access to this account
            ctx.assertAccountAccess(input.adsAccountId);

            await db
                .insert(userPreferences)
                .values({
                    merchbaseUserId: ctx.user.merchbaseUserId,
                    selectedAdsAccountId: input.adsAccountId,
                    selectedProfileId: input.profileId,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userPreferences.merchbaseUserId,
                    set: {
                        selectedAdsAccountId: input.adsAccountId,
                        selectedProfileId: input.profileId,
                        updatedAt: new Date(),
                    },
                });

            return true;
        }),
});
