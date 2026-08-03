import { ServiceAccessError } from '@merchbaseco/access';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { db } from '@/db/index';
import { userAccountAccess } from '@/db/schema';
import type { BidBeaconAccess } from '@/services/access/bidbeacon-access';
import { registerWebSocketConnection } from '@/utils/events';
import { type BidBeaconRealtimeTicketStore, REALTIME_PROTOCOL, REALTIME_ROUTE } from './realtime';

export const registerWebSocketRoute = (fastify: FastifyInstance, options: { access: BidBeaconAccess; ticketStore: BidBeaconRealtimeTicketStore }) => {
    fastify.get(REALTIME_ROUTE, { websocket: true }, async (socket: WebSocket, request) => {
        socket.on('error', error => {
            console.error('WebSocket connection error', error);
        });

        if (socket.readyState !== 1) {
            return;
        }

        const ticket = getTicketFromProtocols(request.headers['sec-websocket-protocol']);
        if (!ticket) {
            socket.close(4001, 'Realtime ticket required');
            return;
        }

        const binding = options.ticketStore.consume(ticket, {
            route: REALTIME_ROUTE,
            service: 'bidbeacon',
        });
        if (!binding) {
            socket.close(4003, 'Realtime ticket invalid or expired');
            return;
        }

        try {
            const resolved = await options.access.sessionAccess.evaluateAccess(binding.merchbaseUserId);
            const accessibleAccountIds = await fetchAccessibleAccountIds(resolved.merchbaseUserId);
            registerWebSocketConnection(socket, accessibleAccountIds);
        } catch (error) {
            if (!(error instanceof ServiceAccessError)) {
                console.error('WebSocket authorization failed', error);
            }
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
                // Ignore malformed messages.
            }
        });
    });
};

const getTicketFromProtocols = (header: string | string[] | undefined) => {
    const values = Array.isArray(header) ? header : header?.split(',');
    if (!values?.some(value => value.trim() === REALTIME_PROTOCOL)) {
        return null;
    }
    return values?.map(value => value.trim()).find(value => value.length > 0 && value !== REALTIME_PROTOCOL);
};

const fetchAccessibleAccountIds = async (merchbaseUserId: string) => {
    const rows = await db.select({ adsAccountId: userAccountAccess.adsAccountId }).from(userAccountAccess).where(eq(userAccountAccess.merchbaseUserId, merchbaseUserId));

    return [...new Set(rows.map(row => row.adsAccountId))];
};
