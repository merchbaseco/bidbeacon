import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';
import { startJobs, stopJobs } from '@/jobs/index.js';
import { emitEvent } from '@/utils/events.js';

console.log('Starting BidBeacon Server...');

const fastify = Fastify({
    logger: false, // Disable Pino logger to avoid bundling issues
});

// Register Fastify plugins
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
        // (origin is the client's origin, not the server's)
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

// Health check endpoint
fastify.get('/api/health', async () => {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'bidbeacon-server',
    };
});

// API routes
fastify.register(async fastify => {
    // Register API routes
    const workerStatusModule = await import('@/api/worker/status.js');
    await workerStatusModule.registerStatusRoute(fastify);

    const { registerStartRoute } = await import('@/api/worker/start.js');
    await registerStartRoute(fastify);

    const { registerStopRoute } = await import('@/api/worker/stop.js');
    await registerStopRoute(fastify);

    const { registerSpeedRoute } = await import('@/api/worker/speed.js');
    await registerSpeedRoute(fastify);

    const { registerMetricsRoute } = await import('@/api/worker/metrics.js');
    await registerMetricsRoute(fastify);

    const { registerStatusRoute } = await import('@/api/dashboard/status.js');
    await registerStatusRoute(fastify);

    const { registerReprocessRoute } = await import('@/api/dashboard/reprocess.js');
    await registerReprocessRoute(fastify);

    const { registerTriggerUpdateRoute } = await import('@/api/dashboard/trigger-update.js');
    await registerTriggerUpdateRoute(fastify);

    const { registerListAdvertiserAccountsRoute } = await import('@/api/dashboard/list-advertiser-accounts.js');
    await registerListAdvertiserAccountsRoute(fastify);

    const { registerListAdvertisingAccountsRoute } = await import('@/api/dashboard/list-advertising-accounts.js');
    await registerListAdvertisingAccountsRoute(fastify);

    const { registerSyncAdvertiserAccountsRoute } = await import('@/api/dashboard/sync-advertiser-accounts.js');
    await registerSyncAdvertiserAccountsRoute(fastify);

    const { registerToggleAdvertiserAccountRoute } = await import('@/api/dashboard/toggle-advertiser-account.js');
    await registerToggleAdvertiserAccountRoute(fastify);

    const { registerCreateReportRoute } = await import('@/api/dashboard/create-report.js');
    await registerCreateReportRoute(fastify);

    const { registerRetrieveReportRoute } = await import('@/api/dashboard/retrieve-report.js');
    await registerRetrieveReportRoute(fastify);

    const { registerApiMetricsRoute } = await import('@/api/dashboard/api-metrics.js');
    await registerApiMetricsRoute(fastify);

    const { registerWebSocketRoute } = await import('@/api/events/websocket.js');
    await registerWebSocketRoute(fastify);
});

// 404 handler
fastify.setNotFoundHandler(async (_request, reply) => {
    reply.status(404);
    return {
        success: false,
        error: 'Route not found',
    };
});

// Error handler
fastify.setErrorHandler(async (error, _request, reply) => {
    console.error(`[${new Date().toISOString()}] Unhandled error:`, error);

    // Emit error event to connected clients
    emitEvent({
        type: 'error',
        message: error.message || 'Internal server error',
        details: error.stack,
    });

    reply.status(500);
    return {
        success: false,
        error: 'Internal server error',
    };
});

const port = Number(process.env.PORT) || 8080;

console.log(`Attempting to start server on port ${port}...`);

// Graceful shutdown handler
const shutdown = async (signal: string) => {
    console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);

    try {
        await stopJobs();

        // Close Fastify server
        await fastify.close();
        console.log('[Server] Fastify server closed');

        console.log(`[${new Date().toISOString()}] Shutdown complete`);
        process.exit(0);
    } catch (error) {
        console.error('[Server] Error during shutdown:', error);
        process.exit(1);
    }
};

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

try {
    // Run database migrations
    await runMigrations();

    // Test database connection
    await testConnection();

    // Start recurring jobs
    await startJobs();

    // Start Fastify server
    await fastify.listen({ port, host: '0.0.0.0' });

    // Print startup status summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`[${new Date().toISOString()}] BidBeacon Server Ready`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✓ Database connected`);
    console.log(`✓ Server running on port ${port}`);
    console.log(`✓ Health check endpoint: /api/health`);
    console.log(`✓ Worker control endpoints: /api/worker/status, /api/worker/start, /api/worker/stop`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
} catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
}
