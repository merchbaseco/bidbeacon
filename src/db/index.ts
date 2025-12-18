import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { logger } from '@/utils/logger';
import * as schema from './schema.js';

// Create postgres connection
const queryClient = postgres({
    host: 'postgres',
    port: 5432,
    database: 'bidbeacon',
    username: 'bidbeacon',
    password: process.env.BIDBEACON_DATABASE_PASSWORD!,
    max: 5,
    idle_timeout: 10000,
    max_lifetime: 30000,
    onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Create Drizzle database instance
export const db = drizzle(queryClient, {
    schema,
    logger: process.env.NODE_ENV === 'development',
});

export type Database = typeof db;

// Test database connection
export const testConnection = async () => {
    try {
        // Simple query to test connection
        await db.execute('SELECT 1');
        logger.info('Database connection established');
        return true;
    } catch (error) {
        logger.error({ err: error }, 'Unable to connect to database');
        throw error;
    }
};
