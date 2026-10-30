import {
    CloudflareAssertionError,
    createAccessSnapshotClient,
    createCloudflareAssertionVerifier,
    createCloudflareProjectionHandler,
    createCloudflareServiceAccess,
    ServiceAccessError,
} from '@merchbaseco/access';
import { createDevCloudflareAccess, DEV_ACCESS_AUTHORITY_ORIGIN } from '@merchbaseco/access/dev';
import { eq } from 'drizzle-orm';
import { getDatabaseUrl } from '@/db/database-config';
import type { Database } from '@/db/index';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';
import { disconnectUserConnections } from '@/utils/events';
import { createAccessProjectionStore } from './access-projection-store';

const localHostPattern = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;

export interface BidBeaconPrincipal {
    accessibleAccountIds: string[];
    legacyAdsAccountIds: string[];
    merchbaseUserId: string;
}

export const createBidBeaconAccess = (options: { database: Database; env?: Record<string, string | undefined>; resolveKey?: Parameters<typeof createCloudflareAssertionVerifier>[1] }) => {
    const env = options.env ?? process.env;
    const development = env.NODE_ENV === 'development';
    const authorityOrigin = development ? DEV_ACCESS_AUTHORITY_ORIGIN : required(env, 'MERCHBASE_ACCESS_AUTHORITY_ORIGIN');
    const issuer = development ? 'https://identity.merchbase.invalid' : required(env, 'MERCHBASE_ACCESS_ISSUER');
    const projections = createAccessProjectionStore(options.database, authorityOrigin);
    const resolveServicePrincipal = ({ merchbaseUserId }: { merchbaseUserId: string }) => resolveBidBeaconPrincipal(options.database, merchbaseUserId);
    const loadSnapshot = development
        ? async () => null
        : createAccessSnapshotClient({
              authorityOrigin,
              issuer,
              service: 'bidbeacon',
              clientId: required(env, 'MERCHBASE_ACCESS_BIDBEACON_CLIENT_ID'),
              clientSecret: required(env, 'MERCHBASE_ACCESS_BIDBEACON_CLIENT_SECRET'),
          });
    const verifier = (audience: string, maxLifetimeSeconds?: number) => createCloudflareAssertionVerifier({ issuer, audience, maxLifetimeSeconds, maxMachineLifetimeSeconds: 600 }, options.resolveKey);
    const interactiveVerifier = development ? null : verifier(required(env, 'MERCHBASE_ACCESS_INTERACTIVE_AUDIENCE'));
    const apiVerifier = development ? null : verifier(required(env, 'MERCHBASE_ACCESS_API_AUDIENCE'));
    const common = { authorityOrigin, issuer, service: 'bidbeacon' as const, projections, resolveServicePrincipal, loadSnapshot };
    const unavailableVerifier = {
        verify: async () => {
            throw new ServiceAccessError('unauthenticated');
        },
    };
    const sessionAccess = createCloudflareServiceAccess({ ...common, acceptedPrincipalKinds: ['person'], verifier: interactiveVerifier ?? unavailableVerifier });
    const apiAccess = createCloudflareServiceAccess({ ...common, acceptedPrincipalKinds: ['person', 'api_key'], maxConnectionLifetimeSeconds: 300, verifier: apiVerifier ?? unavailableVerifier });
    let devAccess: Awaited<ReturnType<typeof createDevCloudflareAccess<BidBeaconPrincipal>>> | null = null;
    const initialize = async () => {
        if (development) {
            devAccess = await createDevCloudflareAccess({ databaseUrl: getDatabaseUrl(env), env, projections, resolveServicePrincipal, service: 'bidbeacon' });
        }
    };
    const authorizeRequest = async (request: { headers: Record<string, string | string[] | undefined>; method: string }) => {
        if (request.headers['x-merchbase-user-id']) {
            throw new ServiceAccessError('unauthenticated');
        }
        const host = request.headers.host;
        const origin = request.headers.origin;
        if (typeof host !== 'string' || Array.isArray(origin)) {
            throw new ServiceAccessError('unauthenticated');
        }
        const local = development && localHostPattern.test(host);
        const interactive = host === 'bidbeacon.merchbase.co' || local;
        if (!interactive && host !== 'bidbeacon-api.merchbase.co') {
            throw new ServiceAccessError('unauthenticated');
        }
        if (interactive && (request.method !== 'GET' || request.headers.upgrade)) {
            if (local ? !isLocalOrigin(origin) : origin !== 'https://bidbeacon.merchbase.co') {
                throw new ServiceAccessError('unauthenticated');
            }
        } else if (origin && origin !== 'https://bidbeacon.merchbase.co' && !(local && isLocalOrigin(origin))) {
            throw new ServiceAccessError('unauthenticated');
        }
        if (local && devAccess) {
            return { ...(await devAccess.authorize()), credentialKind: 'session' as const, expiresAt: Date.now() + 3_600_000 };
        }
        const assertion = request.headers['cf-access-jwt-assertion'];
        if (typeof assertion !== 'string') {
            throw new ServiceAccessError('unauthenticated');
        }
        const resolved = await (interactive ? sessionAccess : apiAccess).authorize(assertion);
        return {
            ...resolved,
            credentialKind: interactive ? ('session' as const) : resolved.credentialKind === 'person' ? ('oauth' as const) : ('api_key' as const),
        };
    };
    const internalVerifier = development ? null : verifier(required(env, 'MERCHBASE_ACCESS_BIDBEACON_INTERNAL_AUDIENCE'), 600);
    const authorityClientId = development ? '' : required(env, 'MERCHBASE_ACCESS_AUTHORITY_CLIENT_ID');
    const authorizeSnapshot = async (assertion: string) => {
        if (!internalVerifier) {
            throw new ServiceAccessError('unauthenticated');
        }
        const verified = await internalVerifier.verify(assertion).catch((error: unknown) => {
            throw new ServiceAccessError(error instanceof CloudflareAssertionError && error.code === 'unauthenticated' ? 'unauthenticated' : 'access_unavailable');
        });
        if (verified.kind !== 'machine' || verified.clientId !== authorityClientId) {
            throw new ServiceAccessError('access_denied');
        }
    };
    const projectionHandler = internalVerifier
        ? createCloudflareProjectionHandler({
              ...common,
              authorityClientId,
              verifier: internalVerifier,
              onChanged: async merchbaseUserId => {
                  try {
                      await sessionAccess.evaluateAccess(merchbaseUserId);
                  } catch (error) {
                      if (!(error instanceof ServiceAccessError) || error.code !== 'access_denied') {
                          throw error;
                      }
                  } finally {
                      // Alias ownership can change independently of the previous owner's grant.
                      disconnectUserConnections();
                  }
              },
          })
        : null;
    return { apiAccess, sessionAccess, projections, authorizeRequest, initialize, projectionHandler, authorizeSnapshot };
};
export type BidBeaconAccess = ReturnType<typeof createBidBeaconAccess>;
let defaultAccess: BidBeaconAccess | null = null;
export const getBidBeaconAccess = () => {
    defaultAccess ??= createBidBeaconAccess({ database: db });
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

const required = (env: Record<string, string | undefined>, name: string) => {
    const value = env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required for Merchbase Access.`);
    }
    return value;
};
const isLocalOrigin = (origin: string | undefined) => {
    try {
        const url = new URL(origin ?? '');
        return url.origin === origin && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
        return false;
    }
};
