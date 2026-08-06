import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { operationSchema } from '../operation-schema';

export type TestDatabase = {
    client: PGlite;
    db: PgliteDatabase<typeof operationSchema>;
    close: () => Promise<void>;
};

export const createTestDatabase = async (): Promise<TestDatabase> => {
    const client = await PGlite.create('memory://');
    const db = drizzle(client, { schema: operationSchema });

    try {
        await applyProductionMigrations(client);
    } catch (error) {
        await client.close();
        throw error;
    }

    return {
        client,
        db,
        close: () => client.close(),
    };
};

const applyProductionMigrations = async (client: PGlite) => {
    const migrationsDirectory = fileURLToPath(new URL('../../../drizzle', import.meta.url));
    const journal = JSON.parse(await readFile(`${migrationsDirectory}/meta/_journal.json`, 'utf8')) as {
        entries: Array<{ tag: string }>;
    };

    for (const { tag } of journal.entries) {
        const migration = await readFile(`${migrationsDirectory}/${tag}.sql`, 'utf8');
        for (const statement of migration.split('--> statement-breakpoint')) {
            const query = statement.trim();
            if (query && !isPgliteUnsupported(query)) {
                await client.exec(query);
            }
        }
    }
};

const performanceHourlyStorageConfiguration = /^ALTER TABLE "performance_hourly" SET \(/s;
const pgStatStatementsExtension = /^CREATE EXTENSION IF NOT EXISTS pg_stat_statements;?$/s;

const isPgliteUnsupported = (query: string) => performanceHourlyStorageConfiguration.test(query) || pgStatStatementsExtension.test(query);
