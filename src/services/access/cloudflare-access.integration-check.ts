import websocketPlugin from '@fastify/websocket';
import { applyAccessSnapshot } from '@merchbaseco/access';
import { createDevCloudflareAccess } from '@merchbaseco/access/dev';
import Fastify from 'fastify';
import { generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createBidBeaconRealtimeTicketStore, REALTIME_PROTOCOL, registerRealtimeTicketRoute } from '@/api/events/realtime';
import { registerWebSocketRoute } from '@/api/events/websocket';
import { usersApiRouter } from '@/api/public/users';
import type { Database } from '@/db';
import { advertiserAccount, userAccountAccess } from '@/db/schema';
import { createTestDatabase } from '@/operations/testing/create-test-database';
import { createAccessProjectionStore } from './access-projection-store';
import { createBidBeaconAccess, resolveBidBeaconPrincipal } from './bidbeacon-access';

vi.mock('@/db/index', () => ({ db: {} }));

const issuer = 'https://merchbase-test.cloudflareaccess.com';
const authorityOrigin = 'https://access-internal.test';
const env = {
    NODE_ENV: 'production',
    MERCHBASE_ACCESS_ISSUER: issuer,
    MERCHBASE_ACCESS_AUTHORITY_ORIGIN: authorityOrigin,
    MERCHBASE_ACCESS_INTERACTIVE_AUDIENCE: 'ui',
    MERCHBASE_ACCESS_API_AUDIENCE: 'api',
    MERCHBASE_ACCESS_BIDBEACON_INTERNAL_AUDIENCE: 'internal',
    MERCHBASE_ACCESS_AUTHORITY_CLIENT_ID: 'authority',
    MERCHBASE_ACCESS_BIDBEACON_CLIENT_ID: 'bb',
    MERCHBASE_ACCESS_BIDBEACON_CLIENT_SECRET: 'fixture-secret',
};

describe('BidBeacon real database Cloudflare cutover', () => {
    it('retains shared memberships through person/key rotation, stale replay and grant revocation', async () => {
        const test = await createTestDatabase();
        const database = test.db as unknown as Database;
        const key = await generateKeyPair('RS256');
        const now = Math.floor(Date.now() / 1000);
        const sign = (audience: string, subject: string, clientId?: string, expires = now + 300) =>
            new SignJWT({ type: 'app', ...(clientId ? { common_name: clientId } : {}) })
                .setProtectedHeader({ alg: 'RS256' })
                .setIssuer(issuer)
                .setSubject(subject)
                .setAudience(audience)
                .setIssuedAt(now)
                .setExpirationTime(expires)
                .sign(key.privateKey);
        const app = Fastify();
        try {
            const [first, second] = await database
                .insert(advertiserAccount)
                .values([
                    { adsAccountId: 'shared-amazon', profileId: 'profile-one', accountName: 'First', status: 'CREATED', countryCode: 'US' },
                    { adsAccountId: 'shared-amazon', profileId: 'profile-two', accountName: 'Second', status: 'CREATED', countryCode: 'CA' },
                ])
                .returning();
            await database.insert(userAccountAccess).values([
                { merchbaseUserId: 'mbu_one', advertiserAccountId: first.id, adsAccountId: 'shared-amazon' },
                { merchbaseUserId: 'mbu_one', advertiserAccountId: second.id, adsAccountId: 'shared-amazon' },
                { merchbaseUserId: 'mbu_two', advertiserAccountId: second.id, adsAccountId: 'shared-amazon' },
            ]);
            const memberships = await database.select().from(userAccountAccess);
            const access = createBidBeaconAccess({ database, env, resolveKey: async () => key.publicKey });
            const publish = (
                version: number,
                accessGrant: 'granted' | 'not_granted',
                oldKey: 'active' | 'retired' = 'active',
                accessValidUntil: number | null = null,
                keyExpiresAt: number | null = null
            ) =>
                applyAccessSnapshot({
                    projections: access.projections,
                    issuer,
                    authorityOrigin,
                    service: 'bidbeacon',
                    snapshot: {
                        issuer,
                        service: 'bidbeacon',
                        eventId: `event-${version}`,
                        merchbaseUserId: 'mbu_one',
                        access: accessGrant,
                        accessValidUntil,
                        sourceUpdatedAt: version,
                        identities: [
                            { kind: 'person', subject: 'person-one', state: 'active' },
                            { kind: 'api_key', expiresAt: null, subject: 'key-one', state: oldKey },
                            { kind: 'api_key', expiresAt: keyExpiresAt, subject: 'key-two', state: 'active' },
                        ],
                    },
                });
            await publish(100, 'granted');
            const authorize = async (host: string, assertion: string, extra: Record<string, string> = {}, method = 'GET') =>
                access.authorizeRequest({ headers: { host, 'cf-access-jwt-assertion': assertion, ...extra }, method });
            const person = await sign('ui', 'person-one');
            const apiPerson = await sign('api', 'person-one');
            const keyOne = await sign('api', '', 'key-one');
            const keyTwo = await sign('api', '', 'key-two');
            for (const assertion of [apiPerson, keyOne, keyTwo]) {
                const authorized = await authorize('bidbeacon-api.merchbase.co', assertion);
                expect(authorized.principal.accessibleAccountIds.sort()).toEqual([first.id, second.id].sort());
                expect(authorized.principal.legacyAdsAccountIds).toEqual(['shared-amazon']);
                expect(authorized.credentialKind).not.toBe('session');
            }
            const apiPrincipal = await authorize('bidbeacon-api.merchbase.co', apiPerson);
            const preferenceCaller = usersApiRouter.createCaller({
                accessError: null,
                accessibleAccountIds: apiPrincipal.principal.legacyAdsAccountIds,
                accessibleAdvertiserAccountIds: apiPrincipal.principal.accessibleAccountIds,
                authType: 'access',
                credentialKind: apiPrincipal.credentialKind,
                request: null,
                user: { merchbaseUserId: apiPrincipal.merchbaseUserId },
            });
            await expect(preferenceCaller.getSelectedAccount()).rejects.toThrow('interactive web session');
            expect((await authorize('bidbeacon.merchbase.co', person)).credentialKind).toBe('session');
            for (const [host, assertion] of [
                ['bidbeacon.merchbase.co', apiPerson],
                ['bidbeacon-api.merchbase.co', person],
                ['bidbeacon-internal.merchbase.co', apiPerson],
                ['unknown.test', apiPerson],
            ]) {
                await expect(authorize(host, assertion)).rejects.toMatchObject({ code: 'unauthenticated' });
            }
            await expect(authorize('bidbeacon-api.merchbase.co', apiPerson, { 'x-forwarded-host': 'bidbeacon.merchbase.co', 'x-merchbase-user-id': 'mbu_two' })).rejects.toMatchObject({
                code: 'unauthenticated',
            });
            for (const origin of [undefined, 'https://evil.test']) {
                await expect(authorize('bidbeacon.merchbase.co', person, origin ? { origin } : {}, 'POST')).rejects.toMatchObject({ code: 'unauthenticated' });
            }
            await expect(authorize('bidbeacon.merchbase.co', person, { origin: 'https://bidbeacon.merchbase.co' }, 'POST')).resolves.toMatchObject({ merchbaseUserId: 'mbu_one' });
            await expect(authorize('bidbeacon-api.merchbase.co', await sign('api', 'person-one', undefined, now - 1))).rejects.toMatchObject({ code: 'unauthenticated' });
            await publish(200, 'granted', 'retired');
            await expect(authorize('bidbeacon-api.merchbase.co', keyOne)).rejects.toMatchObject({ code: 'access_denied' });
            await expect(authorize('bidbeacon-api.merchbase.co', keyTwo)).resolves.toMatchObject({ merchbaseUserId: 'mbu_one' });
            const ticketStore = createBidBeaconRealtimeTicketStore();
            await app.register(websocketPlugin);
            registerRealtimeTicketRoute(app, { access, ticketStore });
            registerWebSocketRoute(app, { access, ticketStore });
            await app.listen({ host: '127.0.0.1', port: 0 });
            const address = app.server.address();
            if (!address || typeof address === 'string') {
                throw new Error('Missing realtime proof port');
            }
            const connect = async (assertion: string, origin = 'https://bidbeacon.merchbase.co') => {
                const ticket = await app.inject({
                    method: 'POST',
                    url: '/api/events/ticket',
                    headers: { host: 'bidbeacon.merchbase.co', origin: 'https://bidbeacon.merchbase.co', 'cf-access-jwt-assertion': assertion },
                });
                expect(ticket.statusCode).toBe(200);
                const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/events`, [REALTIME_PROTOCOL, ticket.json().ticket], {
                    headers: { host: 'bidbeacon.merchbase.co', origin, 'cf-access-jwt-assertion': assertion },
                    followRedirects: false,
                });
                return socket;
            };
            const ready = (socket: WebSocket) =>
                new Promise<void>((resolve, reject) => {
                    const interval = setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send('{"type":"ping"}');
                        }
                    }, 10);
                    const timeout = setTimeout(() => {
                        clearInterval(interval);
                        reject(new Error('Realtime proof timed out'));
                    }, 2000);
                    socket.once('error', reject);
                    socket.once('message', () => {
                        clearInterval(interval);
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            const rejectedOrigin = await connect(person, 'https://evil.test');
            await expect(new Promise(resolve => rejectedOrigin.once('close', (code, reason) => resolve({ code, reason: reason.toString() })))).resolves.toEqual({
                code: 4003,
                reason: 'Authentication failed',
            });
            const expirySocket = await connect(await sign('ui', 'person-one', undefined, Math.floor(Date.now() / 1000) + 2));
            await ready(expirySocket);
            await expect(new Promise(resolve => expirySocket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })))).resolves.toEqual({
                code: 4003,
                reason: 'Session expired',
            });
            const activeSocket = await connect(person);
            await ready(activeSocket);
            const disconnected = new Promise(resolve => activeSocket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
            const authorityAssertion = await sign('internal', '', 'authority');
            const receiver = access.projectionHandler;
            if (!receiver) {
                throw new Error('Missing snapshot receiver');
            }
            const receiverRequest = (assertion: string) =>
                new Request('https://bidbeacon-internal.merchbase.co/api/internal/access-snapshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'CF-Access-Jwt-Assertion': assertion },
                    body: JSON.stringify({
                        issuer,
                        service: 'bidbeacon',
                        eventId: 'realtime-refresh',
                        merchbaseUserId: 'mbu_one',
                        access: 'granted',
                        accessValidUntil: null,
                        sourceUpdatedAt: 200,
                        identities: [
                            { kind: 'person', subject: 'person-one', state: 'active' },
                            { kind: 'api_key', subject: 'key-one', state: 'retired', expiresAt: null },
                            { kind: 'api_key', subject: 'key-two', state: 'active', expiresAt: null },
                        ],
                    }),
                });
            expect((await receiver(receiverRequest(await sign('api', '', 'authority')))).status).toBe(401);
            expect((await receiver(receiverRequest(await sign('internal', '', 'other-service')))).status).toBe(403);
            expect((await receiver(receiverRequest(authorityAssertion))).status).toBe(204);
            await expect(disconnected).resolves.toEqual({ code: 4003, reason: 'Access changed' });
            await publish(225, 'granted', 'retired', null, Date.now() - 1);
            await expect(authorize('bidbeacon-api.merchbase.co', apiPerson)).resolves.toMatchObject({ merchbaseUserId: 'mbu_one' });
            await expect(authorize('bidbeacon-api.merchbase.co', keyTwo)).rejects.toMatchObject({ code: 'access_denied' });
            await publish(300, 'not_granted', 'retired');
            await publish(250, 'granted');
            for (const assertion of [apiPerson, keyOne, keyTwo]) {
                await expect(authorize('bidbeacon-api.merchbase.co', assertion)).rejects.toMatchObject({ code: 'access_denied' });
            }
            expect(await database.select().from(userAccountAccess)).toEqual(memberships);
            expect((await resolveBidBeaconPrincipal(database, 'mbu_two')).accessibleAccountIds).toEqual([second.id]);
            const selected = await access.projections.findByMerchbaseUserId('mbu_one');
            expect(selected).toMatchObject({ issuer: authorityOrigin, subject: 'mbu_one', sourceUpdatedAt: 300, access: 'not_granted' });
            await publish(500, 'granted', 'retired', Date.now() - 1);
            await expect(authorize('bidbeacon-api.merchbase.co', apiPerson)).rejects.toMatchObject({ code: 'access_denied' });
            await publish(550, 'granted', 'retired');
            const reboundSocket = await connect(person);
            await ready(reboundSocket);
            const reboundClosed = new Promise(resolve => reboundSocket.once('close', code => resolve(code)));
            const rebind = await receiver(
                new Request('https://bidbeacon-internal.merchbase.co/api/internal/access-snapshot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'CF-Access-Jwt-Assertion': authorityAssertion },
                    body: JSON.stringify({
                        issuer,
                        service: 'bidbeacon',
                        eventId: 'person-rebind',
                        merchbaseUserId: 'mbu_two',
                        access: 'granted',
                        accessValidUntil: null,
                        sourceUpdatedAt: 600,
                        identities: [{ kind: 'person', subject: 'person-one', state: 'active' }],
                    }),
                })
            );
            expect(rebind.status).toBe(204);
            await expect(reboundClosed).resolves.toBe(4003);
            const rebound = await authorize('bidbeacon.merchbase.co', person);
            expect(rebound.merchbaseUserId).toBe('mbu_two');
            expect(rebound.principal.accessibleAccountIds).toEqual([second.id]);
            expect(await database.select().from(userAccountAccess)).toEqual(memberships);
            const store = createAccessProjectionStore(database, 'https://wrong.test');
            expect(await store.findByMerchbaseUserId('mbu_one')).toBeNull();
            await expect(
                createDevCloudflareAccess({
                    env: { NODE_ENV: 'development' },
                    databaseUrl: 'postgresql://remote.test/db',
                    projections: store,
                    resolveServicePrincipal: async () => ({}),
                    service: 'bidbeacon',
                })
            ).rejects.toThrow('local database');
        } finally {
            await app.close();
            await test.close();
        }
    });
});
