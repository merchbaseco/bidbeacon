import type { FastifyInstance } from 'fastify';

export async function registerTestRoute(fastify: FastifyInstance) {
    fastify.get('/api/test', async () => {
        return {
            success: true,
            message: 'BidBeacon API is working!',
            timestamp: new Date().toISOString(),
        };
    });
}

