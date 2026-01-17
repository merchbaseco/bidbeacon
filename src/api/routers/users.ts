import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/index';
import { advertiserAccount, userAccountAccess } from '@/db/schema';
import { protectedProcedure, router } from '../trpc';

export const usersRouter = router({
    me: protectedProcedure.query(async ({ ctx }) => {
        return {
            clerkUserId: ctx.user.sub,
            accessibleAccountIds: ctx.accessibleAccountIds,
        };
    }),

    linkAccount: protectedProcedure
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

    unlinkAccount: protectedProcedure
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
});
