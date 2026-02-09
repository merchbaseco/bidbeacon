import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyToken } from '@clerk/backend';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { apiKey, apiKeyAccountAccess, userAccountAccess } from '@/db/schema';

const API_KEY_PREFIX = 'bbk';
const API_KEY_TOKEN_PREFIX = `${API_KEY_PREFIX}_`;

/**
 * Creates the tRPC context for each request.
 * This is where you can add request-specific data like user info, database connections, etc.
 */
export async function createContext({ req }: CreateFastifyContextOptions) {
    const devUserId = getDevUserId(getHeaderValue(req.headers['x-bidbeacon-dev-user-id']));
    if (devUserId) {
        const accessibleAccountIds = await fetchAccessibleAccountIds(devUserId);
        return { user: { sub: devUserId }, accessibleAccountIds, authType: 'dev', request: req as unknown };
    }

    const apiKeyToken = getApiKeyToken(req.headers);
    if (apiKeyToken) {
        const apiKeyContext = await getApiKeyContext(apiKeyToken);
        if (apiKeyContext) {
            return { ...apiKeyContext, request: req as unknown };
        }
        return { user: null, accessibleAccountIds: [] as string[], authType: 'none', request: req as unknown };
    }

    const token = getBearerToken(req.headers);
    if (!token) {
        return { user: null, accessibleAccountIds: [] as string[], authType: 'none', request: req as unknown };
    }

    try {
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) {
            console.warn('CLERK_SECRET_KEY not configured');
            return { user: null, accessibleAccountIds: [] as string[], authType: 'none', request: req as unknown };
        }

        const payload = await verifyToken(token, { secretKey });
        const user: { sub: string; email?: string } = {
            sub: payload.sub,
            email: payload.email as string | undefined,
        };

        const accessibleAccountIds = await fetchAccessibleAccountIds(payload.sub);

        return { user, accessibleAccountIds, authType: 'clerk', request: req as unknown };
    } catch {
        return { user: null, accessibleAccountIds: [] as string[], authType: 'none', request: req as unknown };
    }
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// ============================================================================
// Helpers
// ============================================================================

const getDevUserId = (override?: string | null) => {
    const trimmedOverride = typeof override === 'string' ? override.trim() : '';
    return trimmedOverride ? trimmedOverride : null;
};

const getHeaderValue = (value?: string | string[]) => {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
};

const getBearerToken = (headers: CreateFastifyContextOptions['req']['headers']) => {
    const authHeader = headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token || token.startsWith(API_KEY_TOKEN_PREFIX)) {
        return null;
    }
    return token;
};

const getApiKeyToken = (headers: CreateFastifyContextOptions['req']['headers']) => {
    const directToken = getHeaderValue(headers['x-bidbeacon-api-key']);
    if (directToken) {
        return directToken.trim();
    }

    const authHeader = headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();
    if (token?.startsWith(API_KEY_TOKEN_PREFIX)) {
        return token;
    }

    return null;
};

const fetchAccessibleAccountIds = async (clerkUserId: string) => {
    const accessibleAccounts = await db.select({ adsAccountId: userAccountAccess.adsAccountId }).from(userAccountAccess).where(eq(userAccountAccess.clerkUserId, clerkUserId));

    return accessibleAccounts.map(account => account.adsAccountId);
};

const getApiKeyContext = async (token: string) => {
    const parsed = parseApiKeyToken(token);
    if (!parsed) {
        return null;
    }

    const record = await db.query.apiKey.findFirst({
        where: eq(apiKey.id, parsed.apiKeyId),
    });

    if (!record || record.revokedAt) {
        return null;
    }

    const secretHash = hashApiKeySecret(parsed.secret);
    if (record.secretHash.length !== secretHash.length) {
        return null;
    }
    if (!timingSafeEqual(Buffer.from(secretHash), Buffer.from(record.secretHash))) {
        return null;
    }

    const accessibleAccounts = await db.select({ adsAccountId: apiKeyAccountAccess.adsAccountId }).from(apiKeyAccountAccess).where(eq(apiKeyAccountAccess.apiKeyId, parsed.apiKeyId));

    await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, parsed.apiKeyId));

    return {
        user: { sub: record.createdBy },
        accessibleAccountIds: accessibleAccounts.map(account => account.adsAccountId),
        authType: 'apiKey',
        apiKeyId: record.id,
    };
};

const parseApiKeyToken = (token: string) => {
    const trimmedToken = token.trim();
    if (!trimmedToken.startsWith(API_KEY_TOKEN_PREFIX)) {
        return null;
    }

    const parts = trimmedToken.split('_');
    if (parts.length !== 3) {
        return null;
    }

    const [, apiKeyId, secret] = parts;
    if (!(apiKeyId && secret)) {
        return null;
    }

    return { apiKeyId, secret };
};

const hashApiKeySecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
