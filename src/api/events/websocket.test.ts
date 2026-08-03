import websocketPlugin from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { REALTIME_PROTOCOL, REALTIME_ROUTE } from './realtime';
import { registerWebSocketRoute } from './websocket';

const authMocks = vi.hoisted(() => ({
    evaluateAccess: vi.fn(),
    registerWebSocketConnection: vi.fn(),
    selectWhere: vi.fn(),
    consume: vi.fn(),
}));

vi.mock('@/db/index', () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => ({ where: authMocks.selectWhere })),
        })),
    },
}));

vi.mock('@/utils/events', () => ({
    registerWebSocketConnection: authMocks.registerWebSocketConnection,
}));

describe('WebSocket authentication', () => {
    let app: FastifyInstance | null = null;

    beforeEach(async () => {
        vi.clearAllMocks();
        authMocks.selectWhere.mockResolvedValue([{ adsAccountId: 'account-1' }]);
        authMocks.evaluateAccess.mockResolvedValue({
            merchbaseUserId: 'mbu_one',
            principal: { accessibleAccountIds: ['account-1'], merchbaseUserId: 'mbu_one' },
        });
        authMocks.consume.mockReturnValue(null);

        app = Fastify();
        await app.register(websocketPlugin);
        registerWebSocketRoute(app, {
            access: { sessionAccess: { evaluateAccess: authMocks.evaluateAccess } } as never,
            ticketStore: { consume: authMocks.consume } as never,
        });
        await app.listen({ host: '127.0.0.1', port: 0 });
    });

    afterEach(async () => {
        await app?.close();
        app = null;
    });

    it('rejects query-string credentials and development parameters', async () => {
        const queryCredential = await connectUntilClosed(`${getWebSocketBaseUrl(app)}?token=secret`);
        const devUser = await connectUntilClosed(`${getWebSocketBaseUrl(app)}?devUserId=attacker`);

        expect(queryCredential).toEqual({ code: 4001, reason: 'Realtime ticket required' });
        expect(devUser).toEqual({ code: 4001, reason: 'Realtime ticket required' });
        expect(authMocks.consume).not.toHaveBeenCalled();
        expect(authMocks.evaluateAccess).not.toHaveBeenCalled();
        expect(authMocks.registerWebSocketConnection).not.toHaveBeenCalled();
    });

    it('authenticates with a single-use ticket in Sec-WebSocket-Protocol', async () => {
        const binding = { merchbaseUserId: 'mbu_one', route: REALTIME_ROUTE, service: 'bidbeacon' } as const;
        authMocks.consume.mockReturnValueOnce(binding).mockReturnValueOnce(null);

        const socket = await connectUntilOpen(getWebSocketBaseUrl(app), [REALTIME_PROTOCOL, 'ticket-one']);
        await vi.waitFor(() => {
            expect(authMocks.consume).toHaveBeenCalledWith('ticket-one', { route: REALTIME_ROUTE, service: 'bidbeacon' });
            expect(authMocks.evaluateAccess).toHaveBeenCalledWith('mbu_one');
            expect(authMocks.registerWebSocketConnection).toHaveBeenCalledWith(expect.anything(), ['account-1']);
        });
        await closeWebSocket(socket);

        const replay = await connectUntilClosed(getWebSocketBaseUrl(app), [REALTIME_PROTOCOL, 'ticket-one']);
        expect(replay).toEqual({ code: 4003, reason: 'Realtime ticket invalid or expired' });
    });
});

const getWebSocketBaseUrl = (app: FastifyInstance | null) => {
    const address = app?.server.address();
    if (!(address && typeof address !== 'string')) {
        throw new Error('WebSocket test server is not listening');
    }
    return `ws://127.0.0.1:${address.port}/api/events`;
};

const connectUntilClosed = (url: string, protocols?: string[]) =>
    new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const socket = new WebSocket(url, protocols);
        socket.once('error', reject);
        socket.once('close', (code, reason) => {
            resolve({ code, reason: reason.toString() });
        });
    });

const connectUntilOpen = (url: string, protocols: string[]) =>
    new Promise<WebSocket>((resolve, reject) => {
        const socket = new WebSocket(url, protocols);
        socket.once('error', reject);
        socket.once('open', () => resolve(socket));
    });

const closeWebSocket = (socket: WebSocket) =>
    new Promise<void>(resolve => {
        socket.once('close', () => resolve());
        socket.close();
    });
