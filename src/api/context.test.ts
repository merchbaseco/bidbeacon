import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContext } from './context';
import { privateProcedure, router } from './trpc';

const authMocks = vi.hoisted(() => {
    const selectWhere = vi.fn();
    const selectFrom = vi.fn(() => ({ where: selectWhere }));

    return {
        selectFrom,
        selectWhere,
        verifyToken: vi.fn(),
        db: {
            select: vi.fn(() => ({ from: selectFrom })),
            query: {
                apiKey: {
                    findFirst: vi.fn(),
                },
            },
        },
    };
});

vi.mock('@clerk/backend', () => ({
    verifyToken: authMocks.verifyToken,
}));

vi.mock('@/db/index', () => ({
    db: authMocks.db,
}));

const authTestRouter = router({
    viewer: privateProcedure.query(({ ctx }) => ({
        userId: ctx.user.sub,
        accountIds: ctx.accessibleAccountIds,
    })),
});

describe('HTTP authentication', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubEnv('CLERK_SECRET_KEY', 'test-clerk-secret');
        authMocks.selectWhere.mockResolvedValue([{ adsAccountId: 'account-1' }]);
        authMocks.verifyToken.mockResolvedValue({ sub: 'clerk-user' });
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
        expect(authMocks.verifyToken).not.toHaveBeenCalled();
        expect(authMocks.db.select).not.toHaveBeenCalled();
    });

    it('authenticates a legitimate Clerk bearer token', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/api/viewer',
            headers: {
                authorization: 'Bearer clerk-token',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            result: {
                data: {
                    userId: 'clerk-user',
                    accountIds: ['account-1'],
                },
            },
        });
        expect(authMocks.verifyToken).toHaveBeenCalledWith('clerk-token', {
            secretKey: 'test-clerk-secret',
        });
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
