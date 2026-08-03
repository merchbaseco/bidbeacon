import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

/**
 * Base router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * API procedure that requires a shared Merchbase credential.
 * Provides assertAccountAccess helper to validate account access.
 */
export const apiProcedure = t.procedure.use(({ ctx, next }) => {
    if (ctx.accessError === 'access_denied') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Merchbase Access denied' });
    }

    if (ctx.accessError === 'access_unavailable') {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Merchbase Access unavailable' });
    }

    if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'You must be authenticated to access this resource' });
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
 * Private procedure that requires a Clerk web session.
 */
export const privateProcedure = apiProcedure.use(({ ctx, next }) => {
    if (ctx.authType !== 'access' || ctx.credentialKind !== 'session') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'A Clerk web session is required' });
    }

    return next({ ctx });
});
