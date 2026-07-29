import websocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { registerWebSocketRoute } from './websocket';

const authMocks = vi.hoisted(() => {
    const selectWhere = vi.fn();
    const selectFrom = vi.fn(() => ({ where: selectWhere }));

    return {
        selectWhere,
        verifyToken: vi.fn(),
        registerWebSocketConnection: vi.fn(),
        db: {
            select: vi.fn(() => ({ from: selectFrom })),
        },
    };
});

vi.mock('@clerk/backend', () => ({
    verifyToken: authMocks.verifyToken,
}));

vi.mock('@/db/index', () => ({
    db: authMocks.db,
}));

vi.mock('@/utils/events', () => ({
    registerWebSocketConnection: authMocks.registerWebSocketConnection,
}));

describe('WebSocket authentication', () => {
    let app: FastifyInstance | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubEnv('CLERK_SECRET_KEY', 'test-clerk-secret');
        authMocks.selectWhere.mockResolvedValue([{ adsAccountId: 'account-1' }]);
        authMocks.verifyToken.mockResolvedValue({ sub: 'clerk-user' });

        app = Fastify();
        await app.register(websocketPlugin);
        registerWebSocketRoute(app);
        await app.listen({ host: '127.0.0.1', port: 0 });
    });

    afterEach(async () => {
        await app?.close();
        app = null;
        vi.unstubAllEnvs();
    });

    it('rejects the former development-user query parameter', async () => {
        const result = await connectUntilClosed(`${getWebSocketBaseUrl(app)}?devUserId=attacker`);

        expect(result).toEqual({
            code: 4001,
            reason: 'Authentication required',
        });
        expect(authMocks.verifyToken).not.toHaveBeenCalled();
        expect(authMocks.db.select).not.toHaveBeenCalled();
        expect(authMocks.registerWebSocketConnection).not.toHaveBeenCalled();
    });

    it('authenticates a legitimate Clerk token', async () => {
        const socket = await connectUntilOpen(`${getWebSocketBaseUrl(app)}?token=clerk-token`);

        await vi.waitFor(() => {
            expect(authMocks.registerWebSocketConnection).toHaveBeenCalledWith(expect.anything(), ['account-1']);
        });
        expect(authMocks.verifyToken).toHaveBeenCalledWith('clerk-token', {
            secretKey: 'test-clerk-secret',
        });

        await closeWebSocket(socket);
    });
});

const getWebSocketBaseUrl = (app: FastifyInstance | null) => {
    const address = app?.server.address();
    if (!(address && typeof address !== 'string')) {
        throw new Error('WebSocket test server is not listening');
    }
    return `ws://127.0.0.1:${address.port}/api/events`;
};

const connectUntilClosed = (url: string) =>
    new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.once('error', reject);
        socket.once('close', (code, reason) => {
            resolve({ code, reason: reason.toString() });
        });
    });

const connectUntilOpen = (url: string) =>
    new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.once('error', reject);
        socket.once('open', () => resolve(socket));
    });

const closeWebSocket = (socket: WebSocket) =>
    new Promise<void>(resolve => {
        socket.once('close', () => resolve());
        socket.close();
    });
