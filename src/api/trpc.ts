import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

/**
 * Base router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * API procedure that requires authentication (Clerk or API key).
 * Provides assertAccountAccess helper to validate account access.
 */
export const apiProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be logged in to access this resource' });
    }

    const assertAccountAccess = (accountId: string) => {
        if (!ctx.accessibleAccountIds.includes(accountId)) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this account' });
        }
    };

    return next({
        ctx: {
            ...ctx,
            user: ctx.user,
            accessibleAccountIds: ctx.accessibleAccountIds,
            assertAccountAccess,
        },
    });
});

/**
 * Private procedure that requires a Clerk user.
 */
export const privateProcedure = apiProcedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'clerk') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Clerk authentication required' });
    }

    return next({ ctx });
});
