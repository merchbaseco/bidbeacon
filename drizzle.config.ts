import { defineConfig } from 'drizzle-kit';

// Reads the same canonical BIDBEACON_DATABASE_* names as the server; run it
// through `varlock run` (see the db:* scripts) so the schema is the only place
// these values are declared.
export default defineConfig({
    dialect: 'postgresql',
    schema: './src/db/schema.ts',
    out: './drizzle',
    dbCredentials: {
        host: process.env.BIDBEACON_DATABASE_HOST ?? '',
        port: Number(process.env.BIDBEACON_DATABASE_PORT),
        database: process.env.BIDBEACON_DATABASE_NAME ?? '',
        user: process.env.BIDBEACON_DATABASE_USER ?? '',
        password: process.env.BIDBEACON_DATABASE_PASSWORD ?? '',
    },
});
