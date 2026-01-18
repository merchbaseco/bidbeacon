import { verifyToken } from '@clerk/backend';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';

interface ClerkUser {
    sub: string;
    email?: string;
}

/**
 * Creates the tRPC context for each request.
 * This is where you can add request-specific data like user info, database connections, etc.
 */
export async function createContext({ req }: CreateFastifyContextOptions) {
    const devUserId = getDevUserId();
    if (devUserId) {
        const accessibleAccountIds = await fetchAccessibleAccountIds(devUserId);
        return { user: { sub: devUserId }, accessibleAccountIds, request: req };
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
        return { user: null, accessibleAccountIds: [] as string[], request: req };
    }

    try {
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) {
            console.warn('CLERK_SECRET_KEY not configured');
            return { user: null, accessibleAccountIds: [] as string[], request: req };
        }

        const payload = await verifyToken(token, { secretKey });
        const user: ClerkUser = {
            sub: payload.sub,
            email: payload.email as string | undefined,
        };

        const accessibleAccountIds = await fetchAccessibleAccountIds(payload.sub);

        return { user, accessibleAccountIds, request: req };
    } catch {
        return { user: null, accessibleAccountIds: [] as string[], request: req };
    }
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// ============================================================================
// Helpers
// ============================================================================

const getDevUserId = () => {
    const devUserId = process.env.BIDBEACON_DEV_USER_ID?.trim();
    return devUserId ? devUserId : null;
};

const fetchAccessibleAccountIds = async (clerkUserId: string) => {
    const accessibleAccounts = await db
        .select({ adsAccountId: userAccountAccess.adsAccountId })
        .from(userAccountAccess)
        .where(eq(userAccountAccess.clerkUserId, clerkUserId));

    return accessibleAccounts.map(account => account.adsAccountId);
};
