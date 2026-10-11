import 'server-only';

import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Accès base de données.
 *
 * KS Plastico Demo cible PostgreSQL. Deux pilotes sont supportés derrière la même API :
 *
 * - `pglite` (défaut) : PostgreSQL embarqué, fichier local `.data/pglite`.
 *   Permet de lancer le projet sans installer quoi que ce soit — même dialecte
 *   SQL, mêmes migrations, mêmes requêtes qu'en production.
 * - `node-postgres` : dès qu'une `DATABASE_URL` `postgres://` est fournie.
 *
 * Le type exposé est celui de node-postgres : les deux pilotes partagent la
 * même surface d'API Drizzle, la conversion est donc sûre et volontaire.
 */
export type Database = NodePgDatabase<typeof schema>;

type DbState = {
  db: Database;
  driver: 'pglite' | 'node-postgres';
  /** Libère la connexion (fichier PGlite ou pool node-postgres). */
  close: () => Promise<void>;
};

declare global {
  // Le cache global survit au Hot Module Replacement de Next.js en développement.
  var __appDb: Promise<DbState> | undefined;
}

const MIGRATIONS_FOLDER = path.join(process.cwd(), 'drizzle');

async function createPgliteDatabase(): Promise<DbState> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');

  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), '.data', 'pglite');
  // PGlite ne crée pas les répertoires parents.
  await mkdir(path.dirname(dataDir), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return { db: db as unknown as Database, driver: 'pglite', close: () => client.close() };
}

async function createNodePostgresDatabase(url: string): Promise<DbState> {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');

  // Neon fournit actuellement `sslmode=require`. node-postgres 8 l'interprète
  // comme une vérification complète, mais émet un avertissement à chaque
  // démarrage de fonction. Rendre ce comportement explicite garde la connexion
  // chiffrée et évite de polluer les journaux Vercel.
  const connectionString = url.replace(
    /([?&])sslmode=require(?=(&|$))/,
    '$1sslmode=verify-full',
  );
  const pool = new Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });

  if (process.env.APP_AUTO_MIGRATE !== 'false') {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return { db, driver: 'node-postgres', close: () => pool.end() };
}

async function initDatabase(): Promise<DbState> {
  const url = process.env.DATABASE_URL;
  const state =
    url && url.startsWith('post') ? await createNodePostgresDatabase(url) : await createPgliteDatabase();

  // Amorçage automatique : au premier démarrage la base est vide, on charge le
  // jeu de démonstration pour que l'application soit immédiatement lisible (§41).
  if (process.env.APP_AUTO_SEED !== 'false') {
    const { seedIfEmpty } = await import('./seed');
    await seedIfEmpty(state.db);

    // La documentation technique s'amorce séparément : elle est arrivée après
    // le reste et doit pouvoir compléter une base déjà chargée, sans effacer
    // ce que l'utilisateur y a créé entre-temps.
    const { seedMachineDocumentsIfEmpty } = await import('./seed-documents');
    await seedMachineDocumentsIfEmpty(state.db);

    // Idem pour les chiffres d'exploitation des instantanés : ils complètent
    // une base créée avant l'ajout de ces colonnes, sans rien réécrire.
    const { backfillSnapshotMetricsIfMissing } = await import('./seed-snapshots');
    await backfillSnapshotMetricsIfMissing(state.db);

    // Référentiel des actifs : les presses sont rattachées par la migration,
    // le reste du site est amorcé ici. Les deux appels sont idempotents.
    const { linkMachinesWithoutAsset, seedSiteAssetsIfMissing } = await import('./seed-assets');
    await linkMachinesWithoutAsset(state.db);
    await seedSiteAssetsIfMissing(state.db);

    /*
     * Enfin, le jeu est avancé jusqu'à aujourd'hui. Sans ce glissement,
     * l'application affiche une usine à l'arrêt dès le lendemain du seed :
     * les ordres sont datés du jour du chargement, et plus rien n'est
     * « aujourd'hui ».
     */
    const { rollDemoDataForward } = await import('./roll-demo-forward');
    await rollDemoDataForward(state.db);
  }

  return state;
}

/** Point d'entrée unique — toujours `await getDb()` côté serveur. */
export function getDb(): Promise<Database> {
  globalThis.__appDb ??= initDatabase();
  return globalThis.__appDb.then((state) => state.db);
}

/**
 * Ferme la connexion et vide le cache : le prochain `getDb()` repasse par
 * l'initialisation complète (migrations, amorçage, glissement des dates).
 * Utilisé par la réinitialisation nocturne de la démonstration.
 */
export async function closeDatabase(): Promise<void> {
  const current = globalThis.__appDb;
  globalThis.__appDb = undefined;
  if (current) await (await current).close();
}

export async function getDbDriver(): Promise<DbState['driver']> {
  globalThis.__appDb ??= initDatabase();
  return globalThis.__appDb.then((state) => state.driver);
}
