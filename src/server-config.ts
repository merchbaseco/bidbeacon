import Fastify from 'fastify';

export const TRPC_MAX_PATH_PARAM_LENGTH = 4096;
export const DEFAULT_MCP_RESOURCE_URL = 'https://bidbeacon.merchbase.co/mcp';

export const createServer = () =>
    Fastify({
        logger: false,
        routerOptions: {
            // tRPC batch queries encode comma-separated procedure paths into a single route param.
            // Fastify's default maxParamLength (100) is too small and causes false 404s under concurrency.
            maxParamLength: TRPC_MAX_PATH_PARAM_LENGTH,
        },
    });

export const getMcpResourceUrl = (environment: NodeJS.ProcessEnv = process.env) => {
    const value = environment.MCP_RESOURCE_URL?.trim() || DEFAULT_MCP_RESOURCE_URL;

    try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/mcp' || url.search || url.hash) {
            throw new Error('MCP_RESOURCE_URL must be an absolute http(s) URL ending in /mcp without query or hash components.');
        }
        return url.toString();
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('MCP_RESOURCE_URL')) {
            throw error;
        }
        throw new Error('MCP_RESOURCE_URL must be an absolute http(s) URL ending in /mcp without query or hash components.');
    }
};
