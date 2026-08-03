import { type AccessProjection, type AccessProjectionEvent, createClerkAuthenticator, createServiceAccess, ServiceAccessError } from '@merchbaseco/access';
import { describe, expect, it, vi } from 'vitest';

const projection = {
    access: 'granted' as const,
    accessValidUntil: 1500,
    issuer: 'https://clerk.merchbase.co',
    merchbaseUserId: 'mbu_one',
    sourceUpdatedAt: 1000,
    subject: 'user_one',
};

describe('BidBeacon shared access contract', () => {
    it('cold-loads a missing projection, then denies it at expiry', async () => {
        let state: { type: 'missing' } | { projection: AccessProjection; type: 'active' } = { type: 'missing' };
        const apply = vi.fn(async (event: AccessProjectionEvent) => {
            if (event.type === 'upsert' && event.projection) {
                state = { projection: event.projection, type: 'active' };
            }
        });
        const authenticator = {
            authenticate: vi.fn().mockResolvedValue({
                cacheStatus: 'not_applicable',
                credentialKind: 'session',
                expiresAt: null,
                issuer: projection.issuer,
                scopes: [],
                subject: projection.subject,
            }),
            invalidateApiKeys: vi.fn(),
            loadProjection: vi.fn().mockResolvedValue({ projection, sourceUpdatedAt: projection.sourceUpdatedAt }),
        };
        const serviceAccess = createServiceAccess({
            acceptedCredentialKinds: ['session'],
            authenticator: authenticator as never,
            now: () => 1000,
            projections: {
                apply,
                findByIdentity: async () => state,
                findByMerchbaseUserId: async () => (state.type === 'active' ? state.projection : null),
            },
            resolveServicePrincipal: async ({ merchbaseUserId }) => ({ accessibleAccountIds: ['account-1'], merchbaseUserId }),
            service: 'bidbeacon',
        });

        await expect(serviceAccess.authorize('session.jwt.token')).resolves.toMatchObject({
            credentialKind: 'session',
            merchbaseUserId: 'mbu_one',
            principal: { accessibleAccountIds: ['account-1'] },
        });
        expect(authenticator.loadProjection).toHaveBeenCalledTimes(1);
        expect(apply).toHaveBeenCalledTimes(1);

        const expiredAccess = createServiceAccess({
            acceptedCredentialKinds: ['session'],
            authenticator: authenticator as never,
            now: () => 1500,
            projections: {
                apply,
                findByIdentity: async () => state,
                findByMerchbaseUserId: async () => (state.type === 'active' ? state.projection : null),
            },
            resolveServicePrincipal: async ({ merchbaseUserId }) => ({ accessibleAccountIds: [], merchbaseUserId }),
            service: 'bidbeacon',
        });

        await expect(expiredAccess.evaluateAccess('mbu_one')).rejects.toEqual(new ServiceAccessError('access_denied'));
    });

    it('invalidates opaque API-key cache entries by stable Clerk identity', async () => {
        const verify = vi.fn().mockResolvedValue({
            expiration: null,
            expired: false,
            revoked: false,
            scopes: [],
            subject: 'user_one',
        });
        const authenticator = createClerkAuthenticator(
            {
                authorizedParties: ['https://merchbase.co'],
                issuer: 'https://clerk.merchbase.co',
                jwtKey: 'public-key',
                publishableKey: 'pk_test_example',
                secretKey: 'sk_test_example',
            },
            { apiKeys: { verify } } as never
        );

        await authenticator.authenticate('ak_secret', ['api_key']);
        await authenticator.authenticate('ak_secret', ['api_key']);
        expect(verify).toHaveBeenCalledTimes(1);

        authenticator.invalidateApiKeys({ issuer: 'https://clerk.merchbase.co', subject: 'user_one' });
        await authenticator.authenticate('ak_secret', ['api_key']);
        expect(verify).toHaveBeenCalledTimes(2);
    });
});
