import type { IncomingMessage } from 'node:http';
import { corsHeaders, fetchClerkAuthorizationServerMetadata, generateClerkProtectedResourceMetadata } from '@clerk/mcp-tools/server';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { OperationContext } from '@/operations/operation-context';
import { authenticateMcpRequest, MCP_SCOPES, type McpAuthDependencies, type McpAuthResult } from './auth';
import { createBidBeaconMcpServer } from './server';

const protectedResourceBasePath = '/.well-known/oauth-protected-resource';
const authorizationServerBasePath = '/.well-known/oauth-authorization-server';

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
    createContext: (input: { accessibleAccountIds: readonly string[]; merchbaseUserId: string }) => OperationContext | Promise<OperationContext>;
    publishableKey: string;
    resourceUrl: string;
};

export const registerBidBeaconMcpRoutes = async (fastify: FastifyInstance, options: RegisterBidBeaconMcpRoutesOptions) => {
    const protectedResourceMetadata = generateClerkProtectedResourceMetadata({
        properties: {
            resource_name: 'BidBeacon',
            scopes_supported: [...MCP_SCOPES],
        },
        publishableKey: options.publishableKey,
        resourceUrl: options.resourceUrl,
    });

    for (const path of [protectedResourceBasePath, `${protectedResourceBasePath}/mcp`]) {
        fastify.get(path, { config: { cors: MCP_METADATA_CORS } }, async (_request, reply) => sendJson(reply, protectedResourceMetadata, corsHeaders));
    }

    for (const path of [authorizationServerBasePath, `${authorizationServerBasePath}/mcp`]) {
        fastify.get(path, { config: { cors: MCP_METADATA_CORS } }, async (_request, reply) => {
            try {
                const metadata = await fetchClerkAuthorizationServerMetadata({ publishableKey: options.publishableKey });
                return sendJson(reply, metadata, corsHeaders);
            } catch {
                return reply.status(503).send({ error: 'Authorization server metadata unavailable' });
            }
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
    const origin = request.headers.origin;
    if (!isAllowedMcpOrigin(origin)) {
        return reply.status(403).send({ error: 'Invalid Origin' });
    }

    const authentication = await authenticateMcpRequest(request.headers.authorization, options.auth);
    if (authentication.status !== 'authenticated') {
        return sendAuthenticationFailure(reply, authentication, options.resourceUrl);
    }

    const context = await options.createContext({
        accessibleAccountIds: authentication.accessibleAccountIds,
        merchbaseUserId: authentication.merchbaseUserId,
    });
    const server = createBidBeaconMcpServer(context);
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

export const isAllowedMcpOrigin = (origin: string | undefined) => {
    if (!origin) {
        return true;
    }

    try {
        const url = new URL(origin);
        return url.protocol === 'https:' || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
    } catch {
        return false;
    }
};

const getProtectedResourceMetadataUrl = (resourceUrl: string) => {
    const url = new URL(resourceUrl);
    return `${url.origin}${protectedResourceBasePath}${url.pathname}`;
};
