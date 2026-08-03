import { createRealtimeTicketStore, ServiceAccessError } from '@merchbaseco/access';
import type { FastifyInstance } from 'fastify';
import { BIDBEACON_REALTIME_PROTOCOL } from '@/realtime-protocol';
import type { BidBeaconAccess } from '@/services/access/bidbeacon-access';

export const REALTIME_TICKET_PATH = '/api/events/ticket';
export const REALTIME_ROUTE = '/api/events';
export const REALTIME_PROTOCOL = BIDBEACON_REALTIME_PROTOCOL;

export const createBidBeaconRealtimeTicketStore = () => createRealtimeTicketStore({ lifetimeMs: 30_000 });

export type BidBeaconRealtimeTicketStore = ReturnType<typeof createBidBeaconRealtimeTicketStore>;

export const registerRealtimeTicketRoute = (fastify: FastifyInstance, options: { access: BidBeaconAccess; ticketStore: BidBeaconRealtimeTicketStore }) => {
    fastify.post(REALTIME_TICKET_PATH, async (request, reply) => {
        const credential = getBearerToken(request.headers.authorization);
        if (!credential) {
            return reply.code(401).send({ error: 'Authentication required' });
        }

        try {
            const resolved = await options.access.sessionAccess.authorize(credential);
            const ticket = options.ticketStore.issue({
                merchbaseUserId: resolved.merchbaseUserId,
                route: REALTIME_ROUTE,
                service: 'bidbeacon',
            });
            return reply.code(200).send({ ticket });
        } catch (error) {
            return sendAccessError(reply, error);
        }
    });
};

export const getBearerToken = (authorization?: string | string[]) => {
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value?.startsWith('Bearer ')) {
        return null;
    }

    const credential = value.slice('Bearer '.length).trim();
    return credential.length > 0 ? credential : null;
};

export const sendAccessError = (reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, error: unknown) => {
    if (error instanceof ServiceAccessError && error.code === 'access_denied') {
        return reply.code(403).send({ error: 'Access denied' });
    }
    if (error instanceof ServiceAccessError && error.code === 'access_unavailable') {
        return reply.code(503).send({ error: 'Access unavailable' });
    }
    return reply.code(401).send({ error: 'Authentication failed' });
};
