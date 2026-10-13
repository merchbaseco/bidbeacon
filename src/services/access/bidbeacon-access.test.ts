import { ServiceAccessError } from '@merchbaseco/access';
import { describe, expect, it, vi } from 'vitest';
import { authorizeBidBeaconCredential, resolveBidBeaconPrincipal } from './bidbeacon-access';
import { DEV_LOCAL_API_KEY } from './dev-local-credential';

vi.mock('@/db/index', () => ({ db: {} }));

describe('BidBeacon Merchbase Access adapter', () => {
    it('routes suite API keys, OAuth credentials, and session JWTs to the matching adapter', async () => {
        const access = {
            apiKeyAccess: { authorize: vi.fn().mockResolvedValue({ credentialKind: 'api_key' }) },
            oauthAccess: { authorize: vi.fn().mockResolvedValue({ credentialKind: 'oauth' }) },
            sessionAccess: { authorize: vi.fn().mockResolvedValue({ credentialKind: 'session' }) },
        };

        await expect(authorizeBidBeaconCredential(access as never, 'ak_suite-key')).resolves.toEqual({ credentialKind: 'api_key' });
        await expect(authorizeBidBeaconCredential(access as never, 'oat_oauth-token')).resolves.toEqual({ credentialKind: 'oauth' });
        await expect(authorizeBidBeaconCredential(access as never, 'one.two.three')).resolves.toEqual({ credentialKind: 'session' });
        expect(access.apiKeyAccess.authorize).toHaveBeenCalledWith('ak_suite-key');
        expect(access.oauthAccess.authorize).toHaveBeenCalledWith('oat_oauth-token');
        expect(access.sessionAccess.authorize).toHaveBeenCalledWith('one.two.three');
    });

    it('falls back from a JWT-shaped session attempt to OAuth only for unauthenticated sessions', async () => {
        const access = {
            apiKeyAccess: { authorize: vi.fn() },
            oauthAccess: { authorize: vi.fn().mockResolvedValue({ credentialKind: 'oauth' }) },
            sessionAccess: { authorize: vi.fn().mockRejectedValue(new ServiceAccessError('unauthenticated')) },
        };

        await expect(authorizeBidBeaconCredential(access as never, 'one.two.three')).resolves.toEqual({ credentialKind: 'oauth' });
        expect(access.oauthAccess.authorize).toHaveBeenCalledWith('one.two.three');

        access.sessionAccess.authorize.mockRejectedValueOnce(new ServiceAccessError('access_unavailable'));
        await expect(authorizeBidBeaconCredential(access as never, 'four.five.six')).rejects.toMatchObject({ code: 'access_unavailable' });
        expect(access.oauthAccess.authorize).toHaveBeenCalledTimes(1);
    });

    it('refuses the local dev key in production before the suite API-key adapter', async () => {
        const previousNode = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const access = {
                apiKeyAccess: { authorize: vi.fn() },
                oauthAccess: { authorize: vi.fn() },
                sessionAccess: { authorize: vi.fn() },
            };

            await expect(authorizeBidBeaconCredential(access as never, DEV_LOCAL_API_KEY)).rejects.toMatchObject({ code: 'unauthenticated' });
            expect(access.apiKeyAccess.authorize).not.toHaveBeenCalled();
        } finally {
            process.env.NODE_ENV = previousNode;
        }
    });

    it('fails closed for retired local key prefixes and malformed credential boundaries', async () => {
        const access = {
            apiKeyAccess: { authorize: vi.fn() },
            oauthAccess: { authorize: vi.fn() },
            sessionAccess: { authorize: vi.fn() },
        };

        for (const credential of ['bbk_legacy', 'ak', 'oat', 'not-a-token', 'one..three']) {
            await expect(authorizeBidBeaconCredential(access as never, credential)).rejects.toMatchObject({ code: 'unauthenticated' });
        }
        expect(access.apiKeyAccess.authorize).not.toHaveBeenCalled();
        expect(access.oauthAccess.authorize).not.toHaveBeenCalled();
        expect(access.sessionAccess.authorize).not.toHaveBeenCalled();
    });

    it('resolves stable-user many-to-many memberships without duplicate accounts', async () => {
        const where = vi.fn().mockResolvedValue([
            { advertiserAccountId: '00000000-0000-4000-8000-000000000001', adsAccountId: 'shared-amazon-account' },
            { advertiserAccountId: '00000000-0000-4000-8000-000000000001', adsAccountId: 'shared-amazon-account' },
            { advertiserAccountId: '00000000-0000-4000-8000-000000000002', adsAccountId: 'shared-amazon-account' },
        ]);
        const database = {
            select: vi.fn(() => ({
                from: vi.fn(() => ({ where })),
            })),
        };

        await expect(resolveBidBeaconPrincipal(database as never, 'mbu_one')).resolves.toEqual({
            accessibleAccountIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'],
            legacyAdsAccountIds: ['shared-amazon-account'],
            merchbaseUserId: 'mbu_one',
        });
        await expect(resolveBidBeaconPrincipal(database as never, 'user_one')).rejects.toMatchObject({ code: 'access_unavailable' });
    });
});
