import { ServiceAccessError } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { BidBeaconAccess } from '@/services/access/bidbeacon-access';

export const MCP_SCOPES = ['openid', 'email', 'profile'] as const;
const bearerTokenPattern = /^Bearer\s+(\S+)$/i;

export type McpAuthorizedPrincipal = {
    accessibleAccountIds: readonly string[];
    merchbaseUserId: string;
};

export type McpAuthDependencies = {
    authorize: (token: string) => Promise<McpAuthorizedPrincipal>;
};

export type McpAuthResult =
    | (McpAuthorizedPrincipal & { authInfo: AuthInfo; status: 'authenticated' })
    | { status: 'forbidden'; missingScopes: string[] }
    | { status: 'unauthorized' }
    | { status: 'unavailable' };

export const createBidBeaconMcpAuth = (access: Pick<BidBeaconAccess, 'oauthAccess'>): McpAuthDependencies => ({
    authorize: async token => {
        const authorized = await access.oauthAccess.authorize(token);
        return {
            accessibleAccountIds: [...authorized.principal.accessibleAccountIds],
            merchbaseUserId: authorized.merchbaseUserId,
        };
    },
});

export const authenticateMcpRequest = async (authorization: string | undefined, dependencies: McpAuthDependencies): Promise<McpAuthResult> => {
    const token = extractBearerToken(authorization);
    if (!token || token.startsWith('ak_')) {
        return { status: 'unauthorized' };
    }

    try {
        const authorized = await dependencies.authorize(token);
        return {
            ...authorized,
            authInfo: {
                clientId: 'clerk',
                extra: { merchbaseUserId: authorized.merchbaseUserId },
                scopes: [...MCP_SCOPES],
                token,
            },
            status: 'authenticated',
        };
    } catch (error) {
        if (error instanceof ServiceAccessError) {
            if (error.code === 'insufficient_scope') {
                return { missingScopes: [...MCP_SCOPES], status: 'forbidden' };
            }
            if (error.code === 'access_denied') {
                return { missingScopes: [], status: 'forbidden' };
            }
            if (error.code === 'access_unavailable') {
                return { status: 'unavailable' };
            }
        }

        return { status: 'unauthorized' };
    }
};

const extractBearerToken = (authorization: string | undefined) => {
    const match = authorization?.match(bearerTokenPattern);
    return match?.[1];
};
