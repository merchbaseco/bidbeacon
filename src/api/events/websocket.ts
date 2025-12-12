import type { FastifyInstance } from 'fastify';
import { registerWebSocketConnection } from '@/utils/events.js';

export function registerWebSocketRoute(fastify: FastifyInstance) {
    fastify.get('/api/events', { websocket: true }, (connection, req) => {
        console.log('[WebSocket Route] New connection request', {
            url: req.url,
            headers: req.headers,
            readyState: connection.socket.readyState,
        });

        registerWebSocketConnection(connection);

        connection.socket.on('message', message => {
            // Echo back any messages (for ping/pong or future client->server communication)
            try {
                const data = JSON.parse(message.toString());
                console.log('[WebSocket] Received message from client:', data);
            } catch {
                // Ignore non-JSON messages
            }
        });
    });
}
