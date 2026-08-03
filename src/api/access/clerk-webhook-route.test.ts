import { createHmac } from 'node:crypto';
import type { AccessProjection, AccessProjectionEvent, AccessProjectionStore, ClerkIdentity } from '@merchbaseco/access';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerClerkAccessWebhookRoute } from './clerk-webhook-route';

const signingSecret = `whsec_${Buffer.from('bidbeacon-test-secret').toString('base64')}`;
const issuer = 'https://clerk.merchbase.co';

describe('Clerk access projection webhook route', () => {
    it('verifies signatures, is idempotent, and ignores out-of-order projections', async () => {
        const events: AccessProjectionEvent[] = [];
        const store = createMonotonicTestStore(events);
        const identityChanged = vi.fn();
        const app = Fastify();
        registerClerkAccessWebhookRoute(app, {
            issuer,
            onIdentityChanged: identityChanged,
            signingSecret,
            store,
        });
        await app.ready();

        const current = projectionPayload(2000, 'mbu_one');
        const first = await app.inject(signedRequest('msg-current', current));
        const duplicate = await app.inject(signedRequest('msg-current', current));
        const old = await app.inject(signedRequest('msg-old', projectionPayload(1000, 'mbu_old')));

        expect(first.statusCode).toBe(204);
        expect(duplicate.statusCode).toBe(204);
        expect(old.statusCode).toBe(204);
        expect(events).toHaveLength(2);
        expect(store.getCurrent()?.merchbaseUserId).toBe('mbu_one');
        expect(identityChanged).toHaveBeenCalledTimes(3);

        await app.close();
    });

    it('rejects an invalid signature before touching the projection store', async () => {
        const apply = vi.fn();
        const app = Fastify();
        registerClerkAccessWebhookRoute(app, {
            issuer,
            signingSecret,
            store: {
                apply,
                findByIdentity: async () => ({ type: 'missing' }),
                findByMerchbaseUserId: async () => null,
            },
        });
        await app.ready();

        const body = JSON.stringify(projectionPayload(2000, 'mbu_one'));
        const response = await app.inject({
            body,
            headers: {
                'content-type': 'application/json',
                'svix-id': 'msg-invalid',
                'svix-signature': 'v1,not-valid',
                'svix-timestamp': String(Math.floor(Date.now() / 1000)),
            },
            method: 'POST',
            url: '/api/webhooks/clerk/access',
        });

        expect(response.statusCode).toBe(400);
        expect(apply).not.toHaveBeenCalled();
        await app.close();
    });
});

const projectionPayload = (updatedAt: number, userId: string) => ({
    data: {
        id: 'user_one',
        object: 'user',
        public_metadata: {
            merchbase: {
                access: 'granted',
                userId,
            },
        },
        updated_at: updatedAt,
    },
    object: 'event',
    type: 'user.updated',
});

const signedRequest = (eventId: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', Buffer.from('bidbeacon-test-secret')).update(`${eventId}.${timestamp}.${body}`).digest('base64');

    return {
        body,
        headers: {
            'content-type': 'application/json',
            'svix-id': eventId,
            'svix-signature': `v1,${signature}`,
            'svix-timestamp': timestamp,
        },
        method: 'POST' as const,
        url: '/api/webhooks/clerk/access',
    };
};

const createMonotonicTestStore = (events: AccessProjectionEvent[]) => {
    const eventIds = new Set<string>();
    let current: AccessProjection | null = null;

    const store: AccessProjectionStore & { getCurrent: () => AccessProjection | null } = {
        apply: async event => {
            if (eventIds.has(event.eventId)) {
                return;
            }
            eventIds.add(event.eventId);
            events.push(event);
            if (event.type === 'upsert' && (!current || event.projection.sourceUpdatedAt >= current.sourceUpdatedAt)) {
                current = event.projection;
            }
        },
        findByIdentity: async (identity: ClerkIdentity) => {
            if (!current || current.issuer !== identity.issuer || current.subject !== identity.subject) {
                return { type: 'missing' };
            }
            return { projection: current, type: 'active' };
        },
        findByMerchbaseUserId: async merchbaseUserId => (current?.merchbaseUserId === merchbaseUserId ? current : null),
        getCurrent: () => current,
    };
    return store;
};
