import { ServiceAccessError } from '@merchbaseco/access';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeAmazonAdsGateway } from '@/operations/amazon-ads-gateway';
import { createOperationContext } from '@/operations/operation-context';
import type { McpAuthDependencies } from './auth';
import { type RegisterBidBeaconMcpRoutesOptions, registerBidBeaconMcpRoutes } from './http';

const resourceUrl = 'https://bidbeacon.merchbase.co/mcp';
const publishableKey = `pk_test_${Buffer.from('clerk.bidbeacon.test$').toString('base64url')}`;
const apps: FastifyInstance[] = [];
const initializePayload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
        protocolVersion: '2025-06-18',
    },
};

describe('BidBeacon MCP HTTP routes', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        await Promise.all(apps.splice(0).map(app => app.close()));
    });

    it('publishes protected-resource metadata at root and /mcp well-known paths', async () => {
        const app = await createApp();

        for (const url of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
            const response = await app.inject({ method: 'GET', url });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({
                authorization_servers: ['https://clerk.bidbeacon.test'],
                resource: resourceUrl,
                resource_name: 'BidBeacon',
                scopes_supported: ['openid', 'email', 'profile'],
            });
        }
    });

    it('publishes authorization-server metadata at root and /mcp well-known paths', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => Response.json({ authorization_endpoint: 'https://clerk.bidbeacon.test/oauth/authorize', issuer: 'https://clerk.bidbeacon.test' }))
        );
        const app = await createApp();

        for (const url of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp']) {
            const response = await app.inject({ method: 'GET', url });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toMatchObject({ issuer: 'https://clerk.bidbeacon.test' });
        }
    });

    it('returns an RFC 9728 discovery challenge without a bearer token', async () => {
        const app = await createApp();
        const response = await app.inject({ method: 'POST', payload: initializePayload, url: '/mcp' });

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe(`Bearer realm="BidBeacon", resource_metadata="https://bidbeacon.merchbase.co/.well-known/oauth-protected-resource/mcp"`);
    });

    it('rejects insecure remote origins before authentication', async () => {
        const authorize = vi.fn();
        const app = await createApp({ authorize });
        const response = await app.inject({ headers: { origin: 'http://attacker.example' }, method: 'POST', payload: initializePayload, url: '/mcp' });

        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: 'Invalid Origin' });
        expect(authorize).not.toHaveBeenCalled();
    });

    it('builds a fresh stateless authenticated context for each MCP request', async () => {
        const createContext = vi.fn().mockResolvedValue(
            createOperationContext({
                amazonAds: createFakeAmazonAdsGateway(),
                db: {} as never,
                principal: { accessibleAccountIds: [], credentialKind: 'oauth', merchbaseUserId: 'mbu_mcp_http_test' },
            })
        );
        const app = await createApp({ createContext });

        const headers = { accept: 'application/json, text/event-stream', authorization: 'Bearer oat_first', 'content-type': 'application/json' };
        const first = await app.inject({ headers, method: 'POST', payload: initializePayload, url: '/mcp' });
        const second = await app.inject({ headers: { ...headers, authorization: 'Bearer oat_second' }, method: 'POST', payload: initializePayload, url: '/mcp' });

        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(200);
        expect(createContext).toHaveBeenCalledTimes(2);
        expect(createContext).toHaveBeenNthCalledWith(1, { accessibleAccountIds: ['00000000-0000-4000-8000-000000000001'], merchbaseUserId: 'mbu_http_test' });
        expect(createContext).toHaveBeenNthCalledWith(2, { accessibleAccountIds: ['00000000-0000-4000-8000-000000000001'], merchbaseUserId: 'mbu_http_test' });
    });

    it('closes each per-request SDK server and transport when the response completes', async () => {
        const serverClose = vi.spyOn(McpServer.prototype, 'close');
        const transportClose = vi.spyOn(StreamableHTTPServerTransport.prototype, 'close');
        const app = await createApp();

        const response = await app.inject({
            headers: { accept: 'application/json, text/event-stream', authorization: 'Bearer oat_test', 'content-type': 'application/json' },
            method: 'POST',
            payload: initializePayload,
            url: '/mcp',
        });

        expect(response.statusCode).toBe(200);
        await vi.waitFor(() => {
            expect(serverClose).toHaveBeenCalled();
            expect(transportClose).toHaveBeenCalled();
        });
    });

    it.each([
        ['access denied', new ServiceAccessError('access_denied'), 403],
        ['access unavailable', new ServiceAccessError('access_unavailable'), 503],
    ])('maps %s OAuth failures at the HTTP boundary', async (_label, error, statusCode) => {
        const app = await createApp({ authorize: vi.fn().mockRejectedValue(error) });
        const response = await app.inject({ headers: { authorization: 'Bearer oat_test' }, method: 'POST', payload: initializePayload, url: '/mcp' });

        expect(response.statusCode).toBe(statusCode);
    });
});

const createApp = async (overrides: { authorize?: McpAuthDependencies['authorize']; createContext?: RegisterBidBeaconMcpRoutesOptions['createContext'] } = {}) => {
    const app = Fastify();
    apps.push(app);
    await registerBidBeaconMcpRoutes(app, {
        auth: { authorize: overrides.authorize ?? vi.fn().mockResolvedValue({ accessibleAccountIds: ['00000000-0000-4000-8000-000000000001'], merchbaseUserId: 'mbu_http_test' }) },
        createContext:
            overrides.createContext ??
            vi.fn().mockResolvedValue(
                createOperationContext({
                    amazonAds: createFakeAmazonAdsGateway(),
                    db: {} as never,
                    principal: { accessibleAccountIds: [], credentialKind: 'oauth', merchbaseUserId: 'mbu_http_test' },
                })
            ),
        publishableKey,
        resourceUrl,
    });
    return app;
};
