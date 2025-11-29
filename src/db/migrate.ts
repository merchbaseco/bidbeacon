import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

export async function runMigrations() {
  console.log('[Migration] Starting database migrations...');
  
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
      migrationsTable: '__drizzle_migrations'
    });

    console.log('[Migration] All migrations completed successfully');
    
    // Close the migration connection
    await migrationClient.end();
    
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    throw error; // Fail fast if migrations fail
  }
}

