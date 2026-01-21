import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseConfig } from './database-config.js';
import * as schema from './schema.js';

const databaseConfig = getDatabaseConfig();

// Create postgres connection
const queryClient = postgres({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    username: databaseConfig.user,
    password: databaseConfig.password,
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
        return true;
    } catch (error) {
        console.error('Unable to connect to database', error);
        throw error;
    }
};
