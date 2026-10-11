/**
 * Suite donnée à une décision.
 *
 * Le produit dit « l'IA recommande, l'humain décide » — mais il ne montrait
 * jamais *ce que les décisions ont donné*. Sans cette boucle, rien ne prouve
 * que l'outil sert à quelque chose, et rien ne permet de constater qu'une
 * recommandation était mauvaise.
 *
 * Ce module ne mesure que ce qui est réellement enregistré : la date de la
 * décision et celle de la résolution de l'alerte. Le gain financier
 * *effectivement* constaté, lui, n'est pas mesuré aujourd'hui — et on ne le
 * remplace pas par le gain attendu, qui n'est qu'une prévision.
 */

export type DecisionOutcome =
  /** Approuvée, et l'alerte s'est refermée derrière. */
  | { kind: 'resolved'; minutesToResolve: number }
  /** Approuvée, l'alerte est toujours ouverte. */
  | { kind: 'pending' }
  /** Refusée : l'alerte a suivi son cours sans l'application. */
  | { kind: 'rejected'; resolved: boolean };

export function decisionOutcome(input: {
  decision: string;
  decidedAt: Date;
  alertResolvedAt: Date | null;
}): DecisionOutcome {
  if (input.decision === 'rejected') {
    return { kind: 'rejected', resolved: input.alertResolvedAt !== null };
  }

  if (input.alertResolvedAt === null) return { kind: 'pending' };

  /*
   * Une alerte close *avant* la décision ne prouve rien sur celle-ci : le
   * délai serait négatif et se lirait comme une résolution instantanée. On
   * plafonne à zéro plutôt que d'afficher un chiffre trompeur.
   */
  const minutes = Math.max(
    Math.round((input.alertResolvedAt.getTime() - input.decidedAt.getTime()) / 60_000),
    0,
  );

  return { kind: 'resolved', minutesToResolve: minutes };
}

export type DecisionStats = {
  total: number;
  approved: number;
  rejected: number;
  /** Approuvées dont l'alerte s'est refermée. */
  resolvedAfterApproval: number;
  /** Gain **attendu** cumulé des décisions approuvées — jamais le gain constaté. */
  expectedGainCents: number;
};

export function summarizeDecisions(
  decisions: readonly { decision: string; expectedGainCents: number; outcome: DecisionOutcome }[],
): DecisionStats {
  return decisions.reduce<DecisionStats>(
    (stats, entry) => ({
      total: stats.total + 1,
      approved: stats.approved + (entry.decision === 'rejected' ? 0 : 1),
      rejected: stats.rejected + (entry.decision === 'rejected' ? 1 : 0),
      resolvedAfterApproval:
        stats.resolvedAfterApproval + (entry.outcome.kind === 'resolved' ? 1 : 0),
      expectedGainCents:
        stats.expectedGainCents + (entry.decision === 'rejected' ? 0 : entry.expectedGainCents),
    }),
    { total: 0, approved: 0, rejected: 0, resolvedAfterApproval: 0, expectedGainCents: 0 },
  );
}
