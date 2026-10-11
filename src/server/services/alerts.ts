import 'server-only';

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { Severity } from '@/components/ui/severity';

/**
 * Centre d'alertes (§11).
 *
 * Une alerte n'est jamais un simple message : elle porte problème, cause
 * probable, conséquences, impact financier, commandes concernées et
 * recommandation associée.
 */

export type AlertRecommendation = {
  id: string;
  status: string;
  title: string;
  rationale: string;
  expectedGainCents: number;
  confidence: number;
  origin: string;
  requiresApproval: boolean;
  action: unknown;
  simulation: {
    scenario: string;
    successProbability: number;
    deltaCents: number;
    baseline: unknown;
    projected: unknown;
  } | null;
  decision: { decision: string; decidedAt: Date; justification: string | null } | null;
};

export type AlertDetail = {
  id: string;
  severity: Severity;
  status: string;
  domain: string;
  title: string;
  problem: string;
  probableCause: string | null;
  consequences: string | null;
  impactCents: number;
  impactOrigin: 'measured' | 'computed' | 'estimated' | 'forecast';
  detectedAt: Date;
  acknowledgedAt: Date | null;
  machineName: string | null;
  machineId: string | null;
  workshopName: string | null;
  orderNumber: string | null;
  orderId: string | null;
  incidentReference: string | null;
  context: Record<string, unknown> | null;
  recommendations: AlertRecommendation[];
};

const SEVERITY_RANK = sql`case
  when ${t.alerts.severity} = 'critical' then 0
  when ${t.alerts.severity} = 'warning' then 1
  when ${t.alerts.severity} = 'info' then 2
  else 3 end`;

export async function listAlerts(options?: { includeResolved?: boolean }): Promise<AlertDetail[]> {
  const db = await getDb();

  const rows = await db
    .select({
      alert: t.alerts,
      machineName: t.machines.name,
      workshopName: t.workshops.name,
      orderNumber: t.customerOrders.number,
      incidentReference: t.incidents.reference,
    })
    .from(t.alerts)
    .leftJoin(t.machines, eq(t.alerts.machineId, t.machines.id))
    .leftJoin(t.workshops, eq(t.alerts.workshopId, t.workshops.id))
    .leftJoin(t.customerOrders, eq(t.alerts.customerOrderId, t.customerOrders.id))
    .leftJoin(t.incidents, eq(t.alerts.incidentId, t.incidents.id))
    .where(options?.includeResolved ? undefined : inArray(t.alerts.status, ['open', 'acknowledged']))
    .orderBy(SEVERITY_RANK, desc(t.alerts.detectedAt));

  if (rows.length === 0) return [];

  const alertIds = rows.map((row) => row.alert.id);

  const recommendationRows = await db
    .select()
    .from(t.recommendations)
    .where(inArray(t.recommendations.alertId, alertIds))
    .orderBy(asc(t.recommendations.createdAt));

  const recommendationIds = recommendationRows.map((row) => row.id);

  const [simulationRows, approvalRows] = await Promise.all([
    recommendationIds.length > 0
      ? db.select().from(t.simulations).where(inArray(t.simulations.recommendationId, recommendationIds))
      : Promise.resolve([]),
    recommendationIds.length > 0
      ? db
          .select()
          .from(t.approvals)
          .where(inArray(t.approvals.recommendationId, recommendationIds))
          .orderBy(desc(t.approvals.decidedAt))
      : Promise.resolve([]),
  ]);

  return rows.map(({ alert, machineName, workshopName, orderNumber, incidentReference }) => ({
    id: alert.id,
    severity: alert.severity as Severity,
    status: alert.status,
    domain: alert.domain,
    title: alert.title,
    problem: alert.problem,
    probableCause: alert.probableCause,
    consequences: alert.consequences,
    impactCents: alert.impactCents,
    impactOrigin: alert.impactOrigin,
    detectedAt: alert.detectedAt,
    acknowledgedAt: alert.acknowledgedAt,
    machineName,
    machineId: alert.machineId,
    workshopName,
    orderNumber,
    orderId: alert.customerOrderId,
    incidentReference,
    context: (alert.context as Record<string, unknown> | null) ?? null,
    recommendations: recommendationRows
      .filter((recommendation) => recommendation.alertId === alert.id)
      .map((recommendation) => {
        const simulation = simulationRows.find(
          (row) => row.recommendationId === recommendation.id,
        );
        const approval = approvalRows.find((row) => row.recommendationId === recommendation.id);

        return {
          id: recommendation.id,
          status: recommendation.status,
          title: recommendation.title,
          rationale: recommendation.rationale,
          expectedGainCents: recommendation.expectedGainCents,
          confidence: recommendation.confidence,
          origin: recommendation.origin,
          requiresApproval: recommendation.requiresApproval,
          action: recommendation.action,
          simulation: simulation
            ? {
                scenario: simulation.scenario,
                successProbability: simulation.successProbability,
                deltaCents: simulation.deltaCents,
                baseline: simulation.baseline,
                projected: simulation.projected,
              }
            : null,
          decision: approval
            ? {
                decision: approval.decision,
                decidedAt: approval.decidedAt,
                justification: approval.justification,
              }
            : null,
        };
      }),
  }));
}

export async function getAlert(alertId: string): Promise<AlertDetail | null> {
  const alerts = await listAlerts({ includeResolved: true });
  return alerts.find((alert) => alert.id === alertId) ?? null;
}

export async function countOpenAlertsBySeverity(): Promise<Record<Severity, number>> {
  const db = await getDb();
  const rows = await db
    .select({ severity: t.alerts.severity, count: sql<number>`count(*)::int` })
    .from(t.alerts)
    .where(and(inArray(t.alerts.status, ['open', 'acknowledged'])))
    .groupBy(t.alerts.severity);

  const result: Record<Severity, number> = { normal: 0, info: 0, warning: 0, critical: 0 };
  for (const row of rows) result[row.severity as Severity] = row.count;
  return result;
}
