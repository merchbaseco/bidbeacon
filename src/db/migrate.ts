import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { logger } from '@/utils/logger';

export async function runMigrations() {
    logger.info('Starting database migrations');

    try {
        // Create a dedicated connection for migrations
        const migrationClient = postgres({
            host: 'postgres',
            port: 5432,
            database: 'bidbeacon',
            username: 'bidbeacon',
            password: process.env.BIDBEACON_DATABASE_PASSWORD!,
            max: 1, // Single connection for migrations
            onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
        });

        const migrationDb = drizzle(migrationClient);

        // Run migrations from the drizzle folder
        await migrate(migrationDb, {
            migrationsFolder: './drizzle',
            migrationsTable: '__drizzle_migrations',
        });

        logger.info('All migrations completed successfully');

        // Close the migration connection
        await migrationClient.end();
    } catch (error) {
        logger.error({ err: error }, 'Migration failed');
        throw error; // Fail fast if migrations fail
    }
}
