import 'server-only';

import { sql } from 'drizzle-orm';
import { isDemoMode } from '@/config/demo';
import { closeDatabase, getDb } from '../db/client';

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
  await db.execute(sql`DROP SCHEMA public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

  await closeDatabase();
  await getDb();

  return { durationMs: Date.now() - startedAt };
}
