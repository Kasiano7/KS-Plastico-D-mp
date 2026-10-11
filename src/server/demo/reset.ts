import 'server-only';

import { sql } from 'drizzle-orm';
import { isDemoMode } from '@/config/demo';
import { closeDatabase, getDb, type Database } from '../db/client';

/**
 * Réinitialisation complète de la base de démonstration (cron nocturne).
 *
 * Même séquence que `npm run db:reset`, puis le chemin de démarrage normal :
 * migrations, jeu de démonstration daté d'aujourd'hui, documentation,
 * actifs. Chaque matin, le tableau de bord raconte donc exactement la même
 * histoire, et ce que les visiteurs ont laissé (conversations du copilote,
 * compteurs de débit) disparaît.
 *
 * Refuse de s'exécuter hors démonstration : sur une instance réelle, cette
 * fonction effacerait l'usine.
 */
export async function resetDemoDatabase(): Promise<{ durationMs: number }> {
  if (!isDemoMode()) throw new Error('Réinitialisation réservée au mode démonstration.');

  const startedAt = Date.now();
  const db = await getDb();
  await assertDemoDatabase(db);
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

  await closeDatabase();
  await getDb();

  return { durationMs: Date.now() - startedAt };
}

/**
 * Dernier verrou avant l'effacement : la base doit être une base de
 * démonstration. Un seul compte hors du domaine réservé `@demo.example`
 * (RFC 2606) suffit à refuser — c'est le signe qu'une `DATABASE_URL` pointe
 * vers une base réelle, qu'il ne faut jamais effacer. Une base encore vide
 * (pas de table `users`) est acceptée.
 */
export async function assertDemoDatabase(db: Pick<Database, 'execute'>): Promise<void> {
  const tableRows = await db.execute(sql`SELECT to_regclass('public.users') IS NOT NULL AS present`);
  const present = (rowsOf(tableRows)[0] as { present?: boolean } | undefined)?.present;
  if (!present) return;

  const foreignRows = await db.execute(
    sql`SELECT count(*)::int AS outsiders FROM users WHERE email NOT LIKE '%@demo.example'`,
  );
  const foreign = (rowsOf(foreignRows)[0] as { outsiders?: number } | undefined)?.outsiders ?? 0;
  if (foreign > 0) {
    throw new Error(
      `Réinitialisation refusée : ${foreign} compte(s) hors @demo.example — cette base n'est pas une base de démonstration.`,
    );
  }
}

/** node-postgres renvoie `{ rows }`, PGlite également ; on accepte aussi un tableau nu. */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  return (result as { rows?: unknown[] }).rows ?? [];
}
