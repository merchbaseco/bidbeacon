import type { IncomingMessage } from 'node:http';
import { createOAuthResourceMetadata } from '@merchbaseco/access';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OperationContext } from '@/operations/operation-context';
import { authenticateMcpRequest, type McpAuthDependencies, type McpAuthResult } from './auth';
import { bidBeaconMcpOriginForHost, isAllowedMcpOrigin, isBidBeaconMcpPath } from './host-policy';
import { createBidBeaconMcpServer } from './server';

const protectedResourceBasePath = '/.well-known/oauth-protected-resource';

export const MCP_CORS = {
    allowedHeaders: ['Authorization', 'Content-Type', 'Last-Event-ID', 'Mcp-Protocol-Version', 'Mcp-Session-Id'],
    exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    origin: true,
};

const MCP_METADATA_CORS = {
    allowedHeaders: '*',
    methods: ['GET', 'OPTIONS'],
    origin: '*',
};

export type RegisterBidBeaconMcpRoutesOptions = {
    auth: McpAuthDependencies;
    createContext: (input: { accessibleAccountIds: readonly string[]; credential: string; merchbaseUserId: string }) => OperationContext | Promise<OperationContext>;
    issuer: string;
    resourceUrl: string;
};

export const registerBidBeaconMcpRoutes = async (fastify: FastifyInstance, options: RegisterBidBeaconMcpRoutesOptions) => {
    for (const path of [protectedResourceBasePath, `${protectedResourceBasePath}/mcp`]) {
        fastify.get(path, { config: { cors: MCP_METADATA_CORS } }, async (request, reply) => {
            const resourceUrl = getMcpResourceUrlForRequest(request, options);
            if (!resourceUrl) {
                return reply.code(404).send();
            }
            const metadata = createOAuthResourceMetadata({ authorizationServer: options.issuer, resource: resourceUrl });
            return sendJson(reply, metadata, { 'Access-Control-Allow-Origin': '*' });
        });
    }

    fastify.route({
        config: { cors: MCP_CORS },
        handler: async (request, reply) => handleMcpRequest(request, reply, options),
        method: ['GET', 'POST', 'DELETE'],
        url: '/mcp',
    });
};

const handleMcpRequest = async (request: FastifyRequest, reply: FastifyReply, options: RegisterBidBeaconMcpRoutesOptions) => {
    const resourceUrl = getMcpResourceUrlForRequest(request, options);
    if (!(isBidBeaconMcpPath(request.url) && resourceUrl)) {
        return reply.code(404).send({ error: 'Not Found' });
    }
    const origin = request.headers.origin;
    if (!isAllowedMcpOrigin(origin)) {
        return reply.status(403).send({ error: 'Invalid Origin' });
    }

    if (request.headers['x-merchbase-user-id']) {
        return reply.status(401).send({ error: 'Unauthorized' });
    }
    const local = typeof request.headers.host === 'string' && bidBeaconMcpOriginForHost(request.headers.host)?.startsWith('http:') === true;
    const assertion = request.headers['cf-access-jwt-assertion'];
    const credential = typeof assertion === 'string' ? assertion : local ? 'development' : null;
    const authentication = await authenticateMcpRequest(credential ? `Bearer ${credential}` : undefined, options.auth, {
        headers: request.headers,
        method: request.method,
        url: request.url,
    });
    if (authentication.status !== 'authenticated') {
        return sendAuthenticationFailure(reply, authentication, resourceUrl);
    }

    const context = await options.createContext({
        accessibleAccountIds: authentication.accessibleAccountIds,
        credential: '',
        merchbaseUserId: authentication.merchbaseUserId,
    });
    const server = createBidBeaconMcpServer(context, new URL(resourceUrl).origin);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const rawRequest = request.raw as IncomingMessage & { auth?: AuthInfo };
    rawRequest.auth = authentication.authInfo;
    setMcpCorsHeaders(reply, origin);
    reply.hijack();

    let closed = false;
    const close = () => {
        if (closed) {
            return;
        }
        closed = true;
        Promise.allSettled([transport.close(), server.close()]).then(() => undefined);
    };
    reply.raw.once('close', close);
    transport.onclose = () => {
        if (closed) {
            return;
        }
        closed = true;
        server.close().catch(() => undefined);
    };

    try {
        await server.connect(transport);
        await transport.handleRequest(rawRequest, reply.raw, request.body);
    } catch (error) {
        console.error('MCP request failed', error);
        if (!reply.raw.headersSent) {
            reply.raw.writeHead(500, { 'content-type': 'application/json' });
            reply.raw.end(JSON.stringify({ error: 'MCP request failed' }));
        }
    }
};

const sendAuthenticationFailure = (reply: FastifyReply, authentication: Exclude<McpAuthResult, { status: 'authenticated' }>, resourceUrl: string) => {
    const metadataUrl = getProtectedResourceMetadataUrl(resourceUrl);
    if (authentication.status === 'unavailable') {
        return reply.status(503).send({ error: 'Authentication service unavailable' });
    }
    if (authentication.status === 'forbidden') {
        const scope = authentication.missingScopes.length > 0 ? `, scope="${authentication.missingScopes.join(' ')}"` : '';
        return reply.header('WWW-Authenticate', `Bearer realm="BidBeacon", error="insufficient_scope"${scope}`).status(403).send({ error: 'Forbidden' });
    }
    return reply.header('WWW-Authenticate', `Bearer realm="BidBeacon", resource_metadata="${metadataUrl}"`).status(401).send({ error: 'Unauthorized' });
};

const sendJson = (reply: FastifyReply, body: unknown, headers: Record<string, string>) => {
    for (const [key, value] of Object.entries(headers)) {
        reply.header(key, value);
    }
    return reply.send(body);
};

const setMcpCorsHeaders = (reply: FastifyReply, origin: string | undefined) => {
    if (origin) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Headers', MCP_CORS.allowedHeaders.join(', '));
    reply.header('Access-Control-Expose-Headers', MCP_CORS.exposedHeaders.join(', '));
    reply.header('Access-Control-Allow-Methods', MCP_CORS.methods.join(', '));
};

const getMcpResourceUrlForRequest = (request: FastifyRequest, options: RegisterBidBeaconMcpRoutesOptions) => {
    const host = request.headers.host;
    const origin = typeof host === 'string' ? bidBeaconMcpOriginForHost(host) : null;
    if (!origin) {
        return null;
    }
    return origin.startsWith('https:') ? `${origin}/mcp` : options.resourceUrl;
};

const getProtectedResourceMetadataUrl = (resourceUrl: string) => {
    const url = new URL(resourceUrl);
    return `${url.origin}${protectedResourceBasePath}${url.pathname}`;
};
