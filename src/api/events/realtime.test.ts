import { createRealtimeTicketStore, ServiceAccessError } from '@merchbaseco/access';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { getBearerToken, registerRealtimeTicketRoute } from './realtime';

describe('realtime authentication tickets', () => {
    it('issues tickets only after HTTP bearer authentication', async () => {
        const authorize = vi.fn().mockResolvedValue({ merchbaseUserId: 'mbu_one' });
        const app = Fastify();
        registerRealtimeTicketRoute(app, {
            access: { sessionAccess: { authorize } } as never,
            ticketStore: createRealtimeTicketStore({ now: () => 1000 }),
        });
        await app.ready();

        const missing = await app.inject({ method: 'POST', url: '/api/events/ticket' });
        const valid = await app.inject({
            headers: { authorization: 'Bearer session.jwt.token' },
            method: 'POST',
            url: '/api/events/ticket',
        });

        expect(missing.statusCode).toBe(401);
        expect(valid.statusCode).toBe(200);
        expect(valid.json().ticket).toEqual(expect.any(String));
        expect(valid.json().ticket).not.toContain('session.jwt.token');
        expect(authorize).toHaveBeenCalledWith('session.jwt.token');
        await app.close();
    });

    it.each([
        ['denied', new ServiceAccessError('access_denied'), 403],
        ['unavailable', new ServiceAccessError('access_unavailable'), 503],
        ['invalid', new ServiceAccessError('unauthenticated'), 401],
    ])('maps %s access outcomes without issuing a ticket', async (_label, error, statusCode) => {
        const app = Fastify();
        registerRealtimeTicketRoute(app, {
            access: { sessionAccess: { authorize: vi.fn().mockRejectedValue(error) } } as never,
            ticketStore: { issue: vi.fn() } as never,
        });
        await app.ready();

        const response = await app.inject({
            headers: { authorization: 'Bearer session.jwt.token' },
            method: 'POST',
            url: '/api/events/ticket',
        });

        expect(response.statusCode).toBe(statusCode);
        await app.close();
    });

    it('uses a fingerprinted single-use ticket with a hard expiry', () => {
        let now = 1000;
        const store = createRealtimeTicketStore({ lifetimeMs: 30_000, now: () => now });
        const ticket = store.issue({ merchbaseUserId: 'mbu_one', route: '/api/events', service: 'bidbeacon' });

        expect(store.consume(ticket, { route: '/api/events', service: 'bidbeacon' })).toMatchObject({ merchbaseUserId: 'mbu_one' });
        expect(store.consume(ticket, { route: '/api/events', service: 'bidbeacon' })).toBeNull();

        const expired = store.issue({ merchbaseUserId: 'mbu_one', route: '/api/events', service: 'bidbeacon' });
        now = 31_000;
        expect(store.consume(expired, { route: '/api/events', service: 'bidbeacon' })).toBeNull();
    });
});

describe('bearer parsing', () => {
    it('accepts only a non-empty Bearer value', () => {
        expect(getBearerToken('Bearer token')).toBe('token');
        expect(getBearerToken('Basic token')).toBeNull();
        expect(getBearerToken('Bearer ')).toBeNull();
        expect(getBearerToken(undefined)).toBeNull();
    });
});
