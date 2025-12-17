import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { registerWebSocketConnection } from '@/utils/events.js';

export function registerWebSocketRoute(fastify: FastifyInstance) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/bfc1d6a1-5da9-445e-ba28-3faa087b1b0f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            location: 'websocket.ts:registerWebSocketRoute',
            message: 'Registering WebSocket route at /api/events',
            data: {},
            timestamp: Date.now(),
            sessionId: 'debug-session',
            hypothesisId: 'H1',
        }),
    }).catch(() => {});
    // #endregion
    fastify.get('/api/events', { websocket: true }, (socket: WebSocket, _req) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/bfc1d6a1-5da9-445e-ba28-3faa087b1b0f', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                location: 'websocket.ts:connection',
                message: 'WebSocket connection received',
                data: { readyState: socket.readyState },
                timestamp: Date.now(),
                sessionId: 'debug-session',
                hypothesisId: 'H1',
            }),
        }).catch(() => {});
        // #endregion
        socket.on('error', error => {
            console.error('[WebSocket] Connection error:', error);
        });

        if (socket.readyState !== 1) {
            return;
        }

        registerWebSocketConnection(socket);

        socket.on('message', (message: Buffer | ArrayBuffer | Buffer[]) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'ping') {
                    socket.send(JSON.stringify({ type: 'pong' }));
                }
            } catch {
                // Ignore malformed messages
            }
        });
    });
}
