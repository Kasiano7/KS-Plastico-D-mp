import { defineConfig } from 'drizzle-kit';

/**
 * Les migrations sont générées pour PostgreSQL et versionnées dans `./drizzle`.
 * Elles sont appliquées à l'identique sur PGlite (développement) et sur un
 * PostgreSQL classique (production).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema/index.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/ks_plastico_demo',
  },
});
