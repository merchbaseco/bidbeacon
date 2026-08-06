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

export const applyProductionMigrations = async (client: PGlite, options: { fromTag?: string; throughTag?: string } = {}) => {
    const migrationsDirectory = fileURLToPath(new URL('../../../drizzle', import.meta.url));
    const journal = JSON.parse(await readFile(`${migrationsDirectory}/meta/_journal.json`, 'utf8')) as {
        entries: Array<{ tag: string }>;
    };

    const startIndex = options.fromTag ? journal.entries.findIndex(entry => entry.tag === options.fromTag) + 1 : 0;
    const endIndex = options.throughTag ? journal.entries.findIndex(entry => entry.tag === options.throughTag) + 1 : journal.entries.length;
    if (options.fromTag && startIndex === 0) {
        throw new Error(`Unknown migration start tag: ${options.fromTag}`);
    }
    if (options.throughTag && endIndex === 0) {
        throw new Error(`Unknown migration end tag: ${options.throughTag}`);
    }

    for (const { tag } of journal.entries.slice(startIndex, endIndex)) {
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
