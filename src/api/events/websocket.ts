import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { registerWebSocketConnection } from '@/utils/events.js';

export function registerWebSocketRoute(fastify: FastifyInstance) {
    fastify.get('/api/events', { websocket: true }, (socket: WebSocket, _req) => {
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
