import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT) || 5432,
    database: process.env.DATABASE_NAME || 'bidbeacon',
    user: process.env.DATABASE_USER || 'bidbeacon',
    password: process.env.BIDBEACON_DATABASE_PASSWORD || ''
  }
});

