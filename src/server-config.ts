import Fastify from 'fastify';

export const TRPC_MAX_PATH_PARAM_LENGTH = 4096;

export const createServer = () =>
    Fastify({
        logger: false,
        routerOptions: {
            // tRPC batch queries encode comma-separated procedure paths into a single route param.
            // Fastify's default maxParamLength (100) is too small and causes false 404s under concurrency.
            maxParamLength: TRPC_MAX_PATH_PARAM_LENGTH,
        },
    });
