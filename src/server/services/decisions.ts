import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { decisionOutcome, summarizeDecisions, type DecisionOutcome } from '../domain/decisions';

export type RecentDecision = {
  id: string;
  decision: string;
  decidedAt: Date;
  decidedBy: string;
  justification: string | null;
  recommendationTitle: string;
  expectedGainCents: number;
  alertId: string | null;
  alertTitle: string | null;
  outcome: DecisionOutcome;
};

/**
 * Fil des décisions prises sur les recommandations.
 *
 * C'est la boucle qui manquait au produit : on voyait ce que l'application
 * propose, jamais ce que les décisions ont donné. Le résultat affiché est
 * celui qui est réellement enregistré — l'alerte s'est-elle refermée, et au
 * bout de combien de temps. Pas un gain « constaté » qui n'est mesuré nulle
 * part.
 */
export async function listRecentDecisions(limit = 8): Promise<{
  decisions: RecentDecision[];
  stats: ReturnType<typeof summarizeDecisions>;
}> {
  const db = await getDb();

  const rows = await db
    .select({
      id: t.approvals.id,
      decision: t.approvals.decision,
      decidedAt: t.approvals.decidedAt,
      justification: t.approvals.justification,
      decidedByName: t.users.fullName,
      recommendationTitle: t.recommendations.title,
      expectedGainCents: t.recommendations.expectedGainCents,
      alertId: t.alerts.id,
      alertTitle: t.alerts.title,
      alertResolvedAt: t.alerts.resolvedAt,
    })
    .from(t.approvals)
    .innerJoin(t.recommendations, eq(t.approvals.recommendationId, t.recommendations.id))
    .leftJoin(t.alerts, eq(t.recommendations.alertId, t.alerts.id))
    .leftJoin(t.users, eq(t.approvals.userId, t.users.id))
    .orderBy(desc(t.approvals.decidedAt))
    .limit(limit);

  const decisions: RecentDecision[] = rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    decidedAt: row.decidedAt,
    // Un compte supprimé ne doit pas effacer la trace de sa décision.
    decidedBy: row.decidedByName ?? 'Utilisateur supprimé',
    justification: row.justification,
    recommendationTitle: row.recommendationTitle,
    expectedGainCents: row.expectedGainCents,
    alertId: row.alertId,
    alertTitle: row.alertTitle,
    outcome: decisionOutcome({
      decision: row.decision,
      decidedAt: row.decidedAt,
      alertResolvedAt: row.alertResolvedAt,
    }),
  }));

  return { decisions, stats: summarizeDecisions(decisions) };
}
