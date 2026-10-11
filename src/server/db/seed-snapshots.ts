import { isNull, sql } from 'drizzle-orm';
import type { Database } from './client';
import * as t from './schema';

/**
 * Complète les instantanés existants avec les chiffres d'exploitation.
 *
 * Les bases créées avant l'ajout de ces colonnes portent des instantanés dont
 * la production, les retards et les arrêts sont vides : l'accueil y afficherait
 * « pas de référence » indéfiniment, alors que le reste du jeu de démonstration
 * est complet.
 *
 * Idempotent, et volontairement limité aux lignes réellement incomplètes : un
 * instantané capturé par le cron n'est jamais réécrit.
 */
export async function backfillSnapshotMetricsIfMissing(db: Database): Promise<number> {
  const incomplete = await db
    .select({ id: t.healthSnapshots.id, productionScore: t.healthSnapshots.productionScore })
    .from(t.healthSnapshots)
    .where(isNull(t.healthSnapshots.producedUnits));

  if (incomplete.length === 0) return 0;

  const TARGET_UNITS = 9_680;

  for (const snapshot of incomplete) {
    /*
     * Les chiffres sont dérivés du score de production déjà enregistré, et non
     * tirés au hasard : un instantané à 92 de production décrit une journée à
     * 92 % de l'objectif. La cohérence du jeu de démonstration est préservée
     * (règle n° 10) plutôt que contredite par des valeurs indépendantes.
     */
    const ratio = snapshot.productionScore / 100;
    const producedUnits = Math.round(TARGET_UNITS * ratio);
    const missedPct = Math.max(1 - ratio, 0);

    await db
      .update(t.healthSnapshots)
      .set({
        producedUnits,
        targetUnits: TARGET_UNITS,
        // Plus la journée s'écarte de l'objectif, plus elle a subi d'arrêts.
        lateOrders: Math.round(missedPct * 40),
        downtimeMinutes: Math.round(missedPct * 2_700),
        downtimeCostCents: Math.round(missedPct * 3_300_000),
      })
      .where(sql`${t.healthSnapshots.id} = ${snapshot.id}`);
  }

  return incomplete.length;
}
