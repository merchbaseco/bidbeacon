import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { registerWebSocketConnection } from '@/utils/events.js';

export function registerWebSocketRoute(fastify: FastifyInstance) {
    // In @fastify/websocket v11, the handler receives the raw WebSocket directly
    fastify.get('/api/events', { websocket: true }, (socket: WebSocket, _req) => {
        console.log('[WebSocket] Connection opened, readyState:', socket.readyState);

        // Attach close handler immediately
        socket.on('close', (code, reason) => {
            console.log(`[WebSocket] CLOSE - Code: ${code}, Reason: ${reason}`);
        });

        socket.on('error', error => {
            console.error('[WebSocket] ERROR:', error);
        });

        if (socket.readyState !== 1) {
            console.log(`[WebSocket] Connection not OPEN (${socket.readyState}), skipping`);
            return;
        }

        // Register with the event emitter for broadcasts
        registerWebSocketConnection(socket);

        // Handle incoming messages
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
