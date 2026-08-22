import { type ClerkAuthenticatorOptions, createClerkAuthenticator, createServiceAccess, ServiceAccessError } from '@merchbaseco/access';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db/index';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';
import { createAccessProjectionStore } from './access-projection-store';

export interface BidBeaconPrincipal {
    accessibleAccountIds: string[];
    legacyAdsAccountIds: string[];
    merchbaseUserId: string;
}

export interface CreateBidBeaconAccessOptions extends ClerkAuthenticatorOptions {
    database: Database;
}

export const createBidBeaconAccess = (options: CreateBidBeaconAccessOptions) => {
    const authenticator = createClerkAuthenticator(options);
    const projections = createAccessProjectionStore(options.database);
    const common = {
        authenticator,
        projections,
        resolveServicePrincipal: ({ merchbaseUserId }: { merchbaseUserId: string }) => resolveBidBeaconPrincipal(options.database, merchbaseUserId),
        service: 'bidbeacon' as const,
    };

    const access = {
        apiKeyAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['api_key'],
        }),
        authenticator,
        oauthAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['oauth'],
        }),
        projections,
        sessionAccess: createServiceAccess({
            ...common,
            acceptedCredentialKinds: ['session'],
        }),
    };

    return {
        ...access,
        authorize: (credential: string) => authorizeBidBeaconCredential(access, credential),
    };
};

export type BidBeaconAccess = ReturnType<typeof createBidBeaconAccess>;

export const authorizeBidBeaconCredential = async (access: Pick<BidBeaconAccess, 'apiKeyAccess' | 'oauthAccess' | 'sessionAccess'>, credential: string) => {
    if (credential.startsWith('ak_')) {
        return access.apiKeyAccess.authorize(credential);
    }

    if (credential.startsWith('oat_')) {
        return access.oauthAccess.authorize(credential);
    }

    if (isJwtLike(credential)) {
        try {
            return await access.sessionAccess.authorize(credential);
        } catch (error) {
            if (error instanceof ServiceAccessError && error.code === 'unauthenticated') {
                return access.oauthAccess.authorize(credential);
            }
            throw error;
        }
    }

    throw new ServiceAccessError('unauthenticated');
};

let defaultAccess: BidBeaconAccess | null = null;

export const getBidBeaconAccess = (): BidBeaconAccess => {
    if (!defaultAccess) {
        defaultAccess = createBidBeaconAccess({
            authorizedParties: parseList(requireEnvironment('BIDBEACON_CLERK_AUTHORIZED_PARTIES')),
            database: db,
            issuer: requireEnvironment('MERCHBASE_CLERK_ISSUER'),
            jwtKey: requireEnvironment('MERCHBASE_CLERK_JWT_KEY'),
            publishableKey: requireEnvironment('MERCHBASE_CLERK_PUBLISHABLE_KEY'),
            secretKey: requireEnvironment('MERCHBASE_CLERK_SECRET_KEY'),
        });
    }

    return defaultAccess;
};

export const resolveBidBeaconPrincipal = async (database: Database, merchbaseUserId: string): Promise<BidBeaconPrincipal> => {
    if (!merchbaseUserId.startsWith('mbu_')) {
        throw new ServiceAccessError('access_unavailable');
    }

    try {
        const rows = await database
            .select({ advertiserAccountId: userAccountAccess.advertiserAccountId, adsAccountId: userAccountAccess.adsAccountId })
            .from(userAccountAccess)
            .where(eq(userAccountAccess.merchbaseUserId, merchbaseUserId));

        if (rows.some(row => !row.advertiserAccountId)) {
            throw new ServiceAccessError('access_unavailable');
        }

        return {
            accessibleAccountIds: [...new Set(rows.map(row => row.advertiserAccountId))],
            legacyAdsAccountIds: [...new Set(rows.map(row => row.adsAccountId))],
            merchbaseUserId,
        };
    } catch {
        throw new ServiceAccessError('access_unavailable');
    }
};

const isJwtLike = (credential: string) => {
    const segments = credential.split('.');
    return segments.length === 3 && segments.every(segment => segment.length > 0);
};

const parseList = (value: string) =>
    value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);

const requireEnvironment = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required for Merchbase Access.`);
    }
    return value;
};
