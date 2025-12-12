import type { FastifyInstance } from 'fastify';
import { registerWebSocketConnection } from '@/utils/events.js';

export function registerWebSocketRoute(fastify: FastifyInstance) {
    fastify.get('/api/events', { websocket: true }, (connection, _req) => {
        // SIMPLE TEST - log immediately
        console.log('=== WEBSOCKET HANDLER CALLED ===');

        registerWebSocketConnection(connection);

        connection.socket.on('message', message => {
            try {
                const data = JSON.parse(message.toString());
                if (data.type === 'ping') {
                    connection.socket.send(JSON.stringify({ type: 'pong' }));
                    return;
                }
            } catch {
                // Ignore
            }
        });
    });
}
