import 'server-only';

import { cache } from 'react';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { getFactoryContext, type FactoryContext } from './factory-context';
import type { HealthDimension } from '../domain/health-score';

/**
 * Instantané quotidien de l'usine.
 *
 * L'accueil comparait des chiffres du jour à rien du tout : la base ne
 * conservait que des scores de santé, jamais la production, les retards, les
 * arrêts ni leur coût. Ce service enregistre ces cinq valeurs une fois par
 * jour et relit celle de la veille.
 *
 * La capture est **idempotente** : appelée dix fois dans la journée, elle met
 * à jour la ligne du jour au lieu d'en créer dix.
 */

export type OperationalMetrics = {
  producedUnits: number;
  targetUnits: number;
  lateOrders: number;
  downtimeMinutes: number;
  downtimeCostCents: number;
};

/** Les chiffres du jour, tels qu'ils seront enregistrés ce soir. */
export function operationalMetricsOf(context: FactoryContext): OperationalMetrics {
  const downtimeMinutes = context.machines.reduce(
    (total, machine) => total + machine.downtimeMinutes,
    0,
  );

  return {
    producedUnits: context.workshops.reduce((total, w) => total + w.producedUnits, 0),
    targetUnits: context.workshops.reduce((total, w) => total + w.targetUnits, 0),
    lateOrders: context.orders.filter((order) => order.isLate).length,
    downtimeMinutes,
    /*
     * Coût d'arrêt : les minutes perdues de chaque presse valorisées à son
     * propre coût horaire. Une presse de 1 500 t à l'arrêt ne coûte pas ce que
     * coûte une 180 t — un coût moyen effacerait précisément l'information
     * qu'on cherche.
     */
    downtimeCostCents: context.machines.reduce(
      (total, machine) =>
        total + Math.round((machine.downtimeMinutes / 60) * machine.hourlyCostCents),
      0,
    ),
  };
}

function startOfParisDay(date: Date): Date {
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Dernier instantané antérieur à aujourd'hui portant des chiffres
 * d'exploitation.
 *
 * « Antérieur à aujourd'hui » et non « exactement hier » : une usine ne tourne
 * pas le dimanche, et comparer un lundi à un dimanche vide n'apprendrait rien.
 * On compare donc au dernier jour réellement enregistré.
 */
export const getPreviousDayMetrics = cache(async (): Promise<OperationalMetrics | null> => {
  const db = await getDb();
  const today = startOfParisDay(new Date());

  const [row] = await db
    .select({
      producedUnits: t.healthSnapshots.producedUnits,
      targetUnits: t.healthSnapshots.targetUnits,
      lateOrders: t.healthSnapshots.lateOrders,
      downtimeMinutes: t.healthSnapshots.downtimeMinutes,
      downtimeCostCents: t.healthSnapshots.downtimeCostCents,
    })
    .from(t.healthSnapshots)
    .where(lt(t.healthSnapshots.capturedAt, today))
    .orderBy(desc(t.healthSnapshots.capturedAt))
    .limit(1);

  // Un instantané antérieur à cette évolution de schéma n'a pas ces colonnes :
  // il ne sert pas de référence, plutôt que de servir des zéros.
  if (!row || row.producedUnits === null) return null;

  return {
    producedUnits: row.producedUnits,
    targetUnits: row.targetUnits ?? 0,
    lateOrders: row.lateOrders ?? 0,
    downtimeMinutes: row.downtimeMinutes ?? 0,
    downtimeCostCents: row.downtimeCostCents ?? 0,
  };
});

/**
 * Enregistre — ou met à jour — l'instantané du jour.
 * Appelé par le cron d'évaluation des alertes, qui tourne déjà chaque jour.
 */
export async function captureDailySnapshot(): Promise<{ created: boolean }> {
  const db = await getDb();
  const context = await getFactoryContext();
  const metrics = operationalMetricsOf(context);
  const today = startOfParisDay(new Date());
  const tomorrow = new Date(today.getTime() + 86_400_000);

  // Le score d'une dimension se lit dans `dimensions`, pas en propriété
  // directe : la table est stockée sous forme de liste pondérée.
  const scoreOf = (dimension: HealthDimension) =>
    context.health.dimensions.find((row) => row.dimension === dimension)?.score ?? 0;

  const values = {
    globalScore: context.health.global,
    productionScore: scoreOf('production'),
    inventoryScore: scoreOf('inventory'),
    machineScore: scoreOf('machines'),
    planningScore: scoreOf('planning'),
    qualityScore: scoreOf('quality'),
    staffScore: scoreOf('staff'),
    ...metrics,
  };

  const [existing] = await db
    .select({ id: t.healthSnapshots.id })
    .from(t.healthSnapshots)
    .where(
      and(gte(t.healthSnapshots.capturedAt, today), lt(t.healthSnapshots.capturedAt, tomorrow)),
    )
    .limit(1);

  if (existing) {
    await db.update(t.healthSnapshots).set(values).where(eq(t.healthSnapshots.id, existing.id));
    return { created: false };
  }

  await db.insert(t.healthSnapshots).values({ ...values, capturedAt: new Date() });
  return { created: true };
}
