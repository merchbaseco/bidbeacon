import { ServiceAccessError } from '@merchbaseco/access';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import { getBidBeaconAccess } from '@/services/access/bidbeacon-access';

export type AuthenticatedUser = {
    merchbaseUserId: string;
};

export type AuthType = 'access' | 'none';
export type CredentialKind = 'api_key' | 'oauth' | 'session';

export type Context = {
    accessError: 'access_denied' | 'access_unavailable' | null;
    accessibleAccountIds: string[];
    accessibleAdvertiserAccountIds: string[];
    authType: AuthType;
    credentialKind: CredentialKind | null;
    operationContext?: unknown;
    request: unknown;
    user: AuthenticatedUser | null;
};

export const createContext = async ({ req }: CreateFastifyContextOptions): Promise<Context> => {
    const unauthenticated = createUnauthenticatedContext(req as unknown);

    try {
        const access = getBidBeaconAccess();
        const resolved = await access.authorizeRequest(req);

        return {
            accessError: null,
            accessibleAccountIds: resolved.principal.legacyAdsAccountIds,
            accessibleAdvertiserAccountIds: resolved.principal.accessibleAccountIds,
            authType: 'access',
            credentialKind: resolved.credentialKind,
            request: req as unknown,
            user: { merchbaseUserId: resolved.merchbaseUserId },
        };
    } catch (error) {
        if (error instanceof ServiceAccessError && (error.code === 'access_denied' || error.code === 'access_unavailable')) {
            return {
                ...unauthenticated,
                accessError: error.code,
            };
        }

        return unauthenticated;
    }
};

const createUnauthenticatedContext = (request: unknown): Context => ({
    accessError: null,
    accessibleAccountIds: [],
    accessibleAdvertiserAccountIds: [],
    authType: 'none',
    credentialKind: null,
    request,
    user: null,
});
