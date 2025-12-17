import type { FastifyRequest } from 'fastify';

/**
 * Creates the tRPC context for each request.
 * This is where you can add request-specific data like user info, database connections, etc.
 */
export async function createContext({ request }: { request: FastifyRequest }) {
    return {
        request,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
