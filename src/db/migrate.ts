import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { getDatabaseConfig } from './database-config.js';

export async function runMigrations() {
    console.log('Starting database migrations');

    try {
        const databaseConfig = getDatabaseConfig();

        // Create a dedicated connection for migrations
        const migrationClient = postgres({
            host: databaseConfig.host,
            port: databaseConfig.port,
            database: databaseConfig.name,
            username: databaseConfig.user,
            password: databaseConfig.password,
            max: 1, // Single connection for migrations
            onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
        });

        const migrationDb = drizzle(migrationClient);

        // Run migrations from the drizzle folder
        await migrate(migrationDb, {
            migrationsFolder: './drizzle',
            migrationsTable: '__drizzle_migrations',
        });

        console.log('All migrations completed successfully');

        // Close the migration connection
        await migrationClient.end();
    } catch (error) {
        console.error('Database migration failed', error);
        throw error;
    }
}

// Helpers live in src/db/database-config.ts
