import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../src/server/db/schema';

// `dotenv/config` seul ne charge que `.env` — jamais `.env.local`, la
// convention suivie par ce projet (voir .env.example). Sans ce chargement
// explicite, ces scripts ciblaient silencieusement PGlite même quand
// `DATABASE_URL` pointait vers un vrai PostgreSQL dans `.env.local`.
loadEnv({ path: path.join(process.cwd(), '.env') });
loadEnv({ path: path.join(process.cwd(), '.env.local'), override: true });

/**
 * Connexion base de données pour les scripts en ligne de commande.
 * Volontairement distincte de `src/server/db/client.ts`, qui est marqué
 * `server-only` et ne peut donc pas être importé hors de Next.js.
 */
export type ScriptDatabase = NodePgDatabase<typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

export async function connect(): Promise<{ db: ScriptDatabase; driver: string; close: () => Promise<void> }> {
  const url = process.env.DATABASE_URL;

  if (url && url.startsWith('post')) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');

    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    return { db, driver: `postgres (${new URL(url).host})`, close: () => pool.end() };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  // PGlite ne crée pas les répertoires parents.
  await mkdir(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db: db as unknown as ScriptDatabase,
    driver: `pglite (${dataDir})`,
    close: () => client.close(),
  };
}
