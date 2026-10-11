import 'server-only';

import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { aggregateOperatorProduction, type OperatorProductionSummary } from '../domain/staffing';

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * Production du jour agrégée par salarié — clé par identifiant technique
 * uniquement (§4). Alimente l'outil IA `get_operator_production`
 * (`ai/tools.ts`), qui pseudonymise chaque ligne avant de la transmettre à
 * un fournisseur distant. N'expose ni nom, ni prénom, ni matricule : seul
 * l'appelant possédant `hr:read` et `production:read` peut demander cette
 * liste, et seul le backend sait relier `employeeId` à une identité réelle.
 */
export async function getOperatorProductionToday(
  workshopId?: string | null,
): Promise<OperatorProductionSummary[]> {
  const db = await getDb();
  const dayStart = startOfDay(new Date());

  const rows = await db
    .select({
      employeeId: t.employees.id,
      workshopId: t.employees.workshopId,
      workshopName: t.workshops.name,
      shift: t.employees.shift,
      machineCode: t.machines.code,
      goodUnits: t.productionRuns.goodUnits,
      rejectedUnits: t.productionRuns.rejectedUnits,
      downtimeMinutes: t.productionRuns.downtimeMinutes,
    })
    .from(t.productionRuns)
    .innerJoin(t.employees, eq(t.productionRuns.operatorId, t.employees.id))
    .innerJoin(t.machines, eq(t.productionRuns.machineId, t.machines.id))
    .leftJoin(t.workshops, eq(t.employees.workshopId, t.workshops.id))
    .where(and(gte(t.productionRuns.startedAt, dayStart), eq(t.employees.isActive, true)));

  const summaries = aggregateOperatorProduction(rows);
  return workshopId ? summaries.filter((summary) => summary.workshopId === workshopId) : summaries;
}
