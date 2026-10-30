import { ServiceAccessError } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { BidBeaconAccess } from '@/services/access/bidbeacon-access';

export const MCP_SCOPES: string[] = [];
const bearerTokenPattern = /^Bearer\s+(\S+)$/i;

export type McpAuthorizedPrincipal = {
    accessibleAccountIds: readonly string[];
    merchbaseUserId: string;
};

export type McpAuthRequest = { headers: Record<string, string | string[] | undefined>; method: string; url: string };

export type McpAuthDependencies = {
    authorize: (token: string, request?: McpAuthRequest) => Promise<McpAuthorizedPrincipal>;
};

export type McpAuthResult =
    | (McpAuthorizedPrincipal & { authInfo: AuthInfo; status: 'authenticated' })
    | { status: 'forbidden'; missingScopes: string[] }
    | { status: 'unauthorized' }
    | { status: 'unavailable' };

export const createBidBeaconMcpAuth = (access: Pick<BidBeaconAccess, 'authorizeMcpRequest'>): McpAuthDependencies => ({
    authorize: async (_assertion, request) => {
        if (!request) {
            throw new ServiceAccessError('unauthenticated');
        }
        const authorized = await access.authorizeMcpRequest(request);
        if (authorized.credentialKind === 'api_key') {
            throw new ServiceAccessError('unauthenticated');
        }
        return { accessibleAccountIds: authorized.principal.accessibleAccountIds, merchbaseUserId: authorized.merchbaseUserId };
    },
});

export const authenticateMcpRequest = async (authorization: string | undefined, dependencies: McpAuthDependencies, request?: McpAuthRequest): Promise<McpAuthResult> => {
    const token = extractBearerToken(authorization);
    if (!token) {
        return { status: 'unauthorized' };
    }

    try {
        const authorized = await dependencies.authorize(token, request);
        return {
            ...authorized,
            authInfo: {
                clientId: 'cloudflare',
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
