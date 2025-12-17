import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

/**
 * Creates the tRPC context for each request.
 * This is where you can add request-specific data like user info, database connections, etc.
 */
export async function createContext({ req }: CreateFastifyContextOptions) {
    return {
        request: req,
    };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
