import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyInstance } from 'fastify';
import { createContext } from '@/api/context.js';
import { appRouter } from '@/api/router.js';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';
import { startJobs, stopJobs } from '@/jobs/index.js';
import { emitEvent } from '@/utils/events.js';
import { logger } from '@/utils/logger';

const PORT = Number(process.env.PORT) || 8080;

// ============================================================================
// BidBeacon Server Startup
// ============================================================================

async function main() {
    logger.info('Starting BidBeacon Server');

    const fastify = Fastify({ logger: false });

    // Fastify setup
    await registerPlugins(fastify);
    await registerRoutes(fastify);
    registerErrorHandlers(fastify);
    registerShutdownHandlers(fastify);

    // Database
    await runMigrations();
    await testConnection();

    // Background jobs
    await startJobs();

    // Start server
    await fastify.listen({ port: PORT, host: '0.0.0.0' });

    logger.info(
        {
            port: PORT,
        },
        'BidBeacon Server Ready'
    );
}

main().catch(err => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
});

// ============================================================================
// Helpers
// ============================================================================

async function registerPlugins(fastify: FastifyInstance) {
    await fastify.register(helmet);
    await fastify.register(websocket);
    await fastify.register(cors, {
        origin: (origin, callback) => {
            const allowedOrigins = ['https://merchbase.co', 'https://admin.bidbeacon.merchbase.co', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173', 'http://localhost:4174'];

            // Allow requests with no origin (e.g., mobile apps, server-to-server)
            if (!origin) return callback(null, true);

            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }

            // Allow any localhost origin for development convenience
            try {
                const url = new URL(origin);
                if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
                    return callback(null, true);
                }
            } catch {
                // Invalid URL, reject
            }

            return callback(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
    });
}

async function registerRoutes(fastify: FastifyInstance) {
    // Health check endpoint
    fastify.get('/api/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'bidbeacon-server',
    }));

    // WebSocket events endpoint (must be registered BEFORE tRPC to avoid route conflicts)
    const { registerWebSocketRoute } = await import('@/api/events/websocket.js');
    await registerWebSocketRoute(fastify);

    // tRPC API routes
    await fastify.register(fastifyTRPCPlugin, {
        prefix: '/api',
        trpcOptions: {
            router: appRouter,
            createContext,
        },
    });
}

function registerErrorHandlers(fastify: FastifyInstance) {
    fastify.setNotFoundHandler(async (_request, reply) => {
        reply.status(404);
        return { success: false, error: 'Route not found' };
    });

    fastify.setErrorHandler(async (error: unknown, _request, reply) => {
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        logger.error({ err: error }, 'Unhandled error');

        emitEvent({
            type: 'error',
            message: errorMessage,
            details: errorStack,
        });

        reply.status(500);
        return { success: false, error: 'Internal server error' };
    });
}

function registerShutdownHandlers(fastify: FastifyInstance) {
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Received shutdown signal, shutting down gracefully');

        try {
            await stopJobs();
            await fastify.close();
            logger.info('Shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error({ err: error }, 'Error during shutdown');
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
