import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';
import { testConnection } from '@/db/index.js';
import { runMigrations } from '@/db/migrate.js';
import { startJobs, stopJobs } from '@/jobs/index.js';

console.log('Starting BidBeacon Server...');

const fastify = Fastify({
    logger: false, // Disable Pino logger to avoid bundling issues
});

// Register Fastify plugins
await fastify.register(helmet);
await fastify.register(cors, {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://merchbase.co',
            'https://admin.bidbeacon.merchbase.co',
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:4173',
            'http://localhost:4174',
        ];

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
    const { registerTestRoute } = await import('@/api/test.js');
    await registerTestRoute(fastify);

    const { registerWorkerRoutes } = await import('@/api/worker.js');
    await registerWorkerRoutes(fastify);

    const { registerDashboardRoutes } = await import('@/api/dashboard.js');
    await registerDashboardRoutes(fastify);
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
    console.log(`✓ Test endpoint: /api/test`);
    console.log(
        `✓ Worker control endpoints: /api/worker/status, /api/worker/start, /api/worker/stop`
    );
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
} catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
}
