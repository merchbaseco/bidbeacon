import { verifyToken } from '@clerk/backend';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';
import { registerWebSocketConnection } from '@/utils/events';

export const registerWebSocketRoute = (fastify: FastifyInstance) => {
    fastify.get('/api/events', { websocket: true }, async (socket: WebSocket, req) => {
        socket.on('error', error => {
            console.error('WebSocket connection error', error);
        });

        if (socket.readyState !== 1) {
            return;
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        // Extract token from query string
        const token = url.searchParams.get('token');

        if (!token) {
            socket.close(4001, 'Authentication required');
            return;
        }

        // Verify token and load accessible accounts
        try {
            const secretKey = process.env.CLERK_SECRET_KEY;
            if (!secretKey) {
                socket.close(4002, 'Server configuration error');
                return;
            }

            const payload = await verifyToken(token, { secretKey });

            // Load accessible account IDs for this user
            const accessibleAccountIds = await fetchAccessibleAccountIds(payload.sub);

            registerWebSocketConnection(socket, accessibleAccountIds);
        } catch (error) {
            console.error('WebSocket authentication failed', error);
            socket.close(4003, 'Authentication failed');
            return;
        }

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
};

// ============================================================================
// Helpers
// ============================================================================

const fetchAccessibleAccountIds = async (clerkUserId: string) => {
    const accessibleAccounts = await db.select({ adsAccountId: userAccountAccess.adsAccountId }).from(userAccountAccess).where(eq(userAccountAccess.clerkUserId, clerkUserId));

    return accessibleAccounts.map(account => account.adsAccountId);
};
