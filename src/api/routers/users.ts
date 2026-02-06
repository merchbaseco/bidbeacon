import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, userAccountAccess, userPreferences } from '@/db/schema';
import { privateProcedure, router } from '../trpc';

export const usersRouter = router({
    me: privateProcedure.query(async ({ ctx }) => {
        return {
            clerkUserId: ctx.user.sub,
            accessibleAccountIds: ctx.accessibleAccountIds,
        };
    }),

    linkAccount: privateProcedure
        .input(z.object({ adsAccountId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // Verify the account exists
            const account = await db.query.advertiserAccount.findFirst({
                where: eq(advertiserAccount.adsAccountId, input.adsAccountId),
            });

            if (!account) {
                throw new Error('Account not found');
            }

            await db
                .insert(userAccountAccess)
                .values({
                    clerkUserId: ctx.user.sub,
                    adsAccountId: input.adsAccountId,
                })
                .onConflictDoNothing();

            return true;
        }),

    unlinkAccount: privateProcedure
        .input(z.object({ adsAccountId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(userAccountAccess).where(
                and(
                    eq(userAccountAccess.clerkUserId, ctx.user.sub),
                    eq(userAccountAccess.adsAccountId, input.adsAccountId)
                )
            );

            return true;
        }),

    getSelectedAccount: privateProcedure.query(async ({ ctx }) => {
        const prefs = await db.query.userPreferences.findFirst({
            where: eq(userPreferences.clerkUserId, ctx.user.sub),
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
                    clerkUserId: ctx.user.sub,
                    selectedAdsAccountId: input.adsAccountId,
                    selectedProfileId: input.profileId,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userPreferences.clerkUserId,
                    set: {
                        selectedAdsAccountId: input.adsAccountId,
                        selectedProfileId: input.profileId,
                        updatedAt: new Date(),
                    },
                });

            return true;
        }),
});
