import { createClerkClient } from '@clerk/backend';
import { TRPCError } from '@trpc/server';
import { publicProcedure } from '@/api/trpc';

/**
 * Mints a short-lived Clerk sign-in ticket for the configured development user.
 *
 * A cloud agent — or a fresh worktree — cannot type a password, so without this
 * the dashboard opens on a sign-in form and nothing behind it is ever seen. The
 * dashboard's `DevAutoSignIn` calls this once on load and exchanges the ticket
 * for a session.
 *
 * Hard-off outside development, three ways, because this endpoint hands out an
 * authenticated session for the asking:
 *
 *   1. `NODE_ENV=production` — set by the Dockerfile, so the shipped image
 *      refuses before it reads anything else.
 *   2. `BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID` unset — the schema resolves it only
 *      on the development arm, so production containers have no user to mint for.
 *   3. A non-loopback `Host` header — a dev server reached through a port
 *      forwarder still presents `localhost` upstream, but anything addressing
 *      this server by a real name is refused.
 *
 * The ticket is returned to the caller and never logged: it is a bearer
 * credential for the whole session it creates.
 */

const SIGN_IN_TOKEN_TTL_SECONDS = 60;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const devCreateClerkSignInToken = publicProcedure.mutation(async ({ ctx }) => {
    const devSignInUserId = assertDevSignInAllowed({
        hostHeader: readHostHeader(ctx.request),
        nodeEnv: process.env.NODE_ENV,
        userId: process.env.BIDBEACON_DEV_CLERK_SIGN_IN_USER_ID,
    });

    const clerkClient = createClerkClient({ secretKey: requireEnvironment('MERCHBASE_CLERK_SECRET_KEY') });
    const signInToken = await clerkClient.signInTokens.createSignInToken({
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
        userId: devSignInUserId,
    });

    return {
        expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
        ticket: signInToken.token,
    };
});

/**
 * The whole gate, as one pure function, so it can be driven directly by a test
 * rather than inferred from a running server. Returns the user id to mint for.
 */
export const assertDevSignInAllowed = ({ hostHeader, nodeEnv, userId }: { hostHeader?: string; nodeEnv?: string; userId?: string }) => {
    if (nodeEnv === 'production') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dev Clerk sign-in tokens are disabled in production' });
    }

    const devSignInUserId = userId?.trim();
    if (!devSignInUserId) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dev Clerk sign-in is not configured' });
    }

    if (!hostHeader) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Missing host header' });
    }

    // `host:port`, or a bracketed IPv6 literal with an optional port.
    const host = (hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0])?.toLowerCase();
    if (!(host && LOOPBACK_HOSTS.has(host))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Dev Clerk sign-in tokens are only available on loopback' });
    }

    return devSignInUserId;
};

const readHostHeader = (request: unknown) => {
    const headers = (request as { headers?: Record<string, string | string[] | undefined> } | null)?.headers;
    const value = headers?.host;
    return Array.isArray(value) ? value[0] : value;
};

const requireEnvironment = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `${name} is required to mint a dev sign-in ticket` });
    }
    return value;
};
