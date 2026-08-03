import { ServiceAccessError } from '@merchbaseco/access';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContext } from './context';
import { apiProcedure, privateProcedure, router } from './trpc';

const authMocks = vi.hoisted(() => {
    return {
        authorize: vi.fn(),
    };
});

vi.mock('@/services/access/bidbeacon-access', () => ({
    authorizeBidBeaconCredential: authMocks.authorize,
    getBidBeaconAccess: () => ({ authorize: authMocks.authorize }),
}));

const authTestRouter = router({
    viewer: privateProcedure.query(({ ctx }) => ({
        userId: ctx.user.merchbaseUserId,
        accountIds: ctx.accessibleAccountIds,
    })),
    apiViewer: apiProcedure.query(({ ctx }) => ({
        credentialKind: ctx.credentialKind,
        userId: ctx.user.merchbaseUserId,
        accountIds: ctx.accessibleAccountIds,
    })),
});

describe('HTTP authentication', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        authMocks.authorize.mockImplementation(async (_access: unknown, credential: string) => {
            if (credential.startsWith('bbk_')) {
                throw new Error('unauthenticated');
            }
            return {
                credentialKind: credential.startsWith('ak_') ? 'api_key' : credential.startsWith('oat_') ? 'oauth' : 'session',
                merchbaseUserId: 'mbu_one',
                principal: {
                    accessibleAccountIds: ['account-1', 'account-2'],
                    merchbaseUserId: 'mbu_one',
                },
            };
        });
        app = await createAuthTestServer();
    });

    afterEach(async () => {
        await app.close();
        vi.unstubAllEnvs();
    });

    it('rejects the former development-user header', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/viewer',
            headers: {
                'x-bidbeacon-dev-user-id': 'attacker',
            },
        });

        expect(response.statusCode).toBe(401);
        expect(authMocks.authorize).not.toHaveBeenCalled();
    });

    it('authenticates a web session into a stable Merchbase User', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/viewer',
            headers: {
                authorization: 'Bearer session.jwt.token',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            result: {
                data: {
                    userId: 'mbu_one',
                    accountIds: ['account-1', 'account-2'],
                },
            },
        });
        expect(authMocks.authorize).toHaveBeenCalledWith(expect.anything(), 'session.jwt.token');
    });

    it.each([
        ['api key', 'ak_suite-key', 'api_key'],
        ['OAuth token', 'oat_oauth-token', 'oauth'],
    ])('accepts a suite %s through the generic bearer header', async (_label, credential, credentialKind) => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/apiViewer',
            headers: { authorization: `Bearer ${credential}` },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().result.data.credentialKind).toBe(credentialKind);
    });

    it('does not accept the retired API-key header or local key prefix', async () => {
        const headerResponse = await app.inject({
            method: 'GET',
            url: '/api/apiViewer',
            headers: { 'x-bidbeacon-api-key': 'ak_suite-key' },
        });
        const legacyResponse = await app.inject({
            method: 'GET',
            url: '/api/apiViewer',
            headers: { authorization: 'Bearer bbk_legacy-key' },
        });

        expect(headerResponse.statusCode).toBe(401);
        expect(legacyResponse.statusCode).toBe(401);
    });

    it('preserves denied and unavailable access outcomes', async () => {
        authMocks.authorize.mockRejectedValueOnce(new ServiceAccessError('access_denied')).mockRejectedValueOnce(new ServiceAccessError('access_unavailable'));

        const denied = await app.inject({ method: 'GET', url: '/api/apiViewer', headers: { authorization: 'Bearer session.jwt.token' } });
        const unavailable = await app.inject({ method: 'GET', url: '/api/apiViewer', headers: { authorization: 'Bearer session.jwt.token' } });

        expect(denied.statusCode).toBe(403);
        expect(unavailable.statusCode).toBe(500);
    });
});

const createAuthTestServer = async () => {
    const app = Fastify();

    await app.register(fastifyTRPCPlugin, {
        prefix: '/api',
        trpcOptions: {
            router: authTestRouter,
            createContext,
        },
    });

    return app;
};
