import { describe, expect, it } from 'vitest';
import { decisionOutcome, summarizeDecisions, type DecisionOutcome } from '../decisions';

const DECIDED = new Date('2026-08-31T08:00:00Z');

describe('decisionOutcome', () => {
  it('mesure le délai de résolution après une approbation', () => {
    const outcome = decisionOutcome({
      decision: 'approved',
      decidedAt: DECIDED,
      alertResolvedAt: new Date('2026-08-31T11:30:00Z'),
    });

    expect(outcome).toEqual({ kind: 'resolved', minutesToResolve: 210 });
  });

  it('reste « en cours » tant que l’alerte n’est pas refermée', () => {
    expect(
      decisionOutcome({ decision: 'approved', decidedAt: DECIDED, alertResolvedAt: null }),
    ).toEqual({ kind: 'pending' });
  });

  it('n’affiche jamais un délai négatif comme une résolution éclair', () => {
    // Alerte close avant la décision : le délai ne prouve rien sur celle-ci.
    const outcome = decisionOutcome({
      decision: 'approved',
      decidedAt: DECIDED,
      alertResolvedAt: new Date('2026-08-31T07:00:00Z'),
    });

    expect(outcome).toEqual({ kind: 'resolved', minutesToResolve: 0 });
  });

  it('distingue un refus, et dit si l’alerte s’est réglée sans l’application', () => {
    expect(
      decisionOutcome({ decision: 'rejected', decidedAt: DECIDED, alertResolvedAt: new Date() }),
    ).toEqual({ kind: 'rejected', resolved: true });

    expect(
      decisionOutcome({ decision: 'rejected', decidedAt: DECIDED, alertResolvedAt: null }),
    ).toEqual({ kind: 'rejected', resolved: false });
  });
});

describe('summarizeDecisions', () => {
  const resolved: DecisionOutcome = { kind: 'resolved', minutesToResolve: 60 };
  const pending: DecisionOutcome = { kind: 'pending' };
  const rejected: DecisionOutcome = { kind: 'rejected', resolved: false };

  it('compte approbations, refus et résolutions', () => {
    const stats = summarizeDecisions([
      { decision: 'approved', expectedGainCents: 100_000, outcome: resolved },
      { decision: 'approved', expectedGainCents: 50_000, outcome: pending },
      { decision: 'rejected', expectedGainCents: 900_000, outcome: rejected },
    ]);

    expect(stats.total).toBe(3);
    expect(stats.approved).toBe(2);
    expect(stats.rejected).toBe(1);
    expect(stats.resolvedAfterApproval).toBe(1);
  });

  it('n’attribue aucun gain à une recommandation refusée', () => {
    const stats = summarizeDecisions([
      { decision: 'approved', expectedGainCents: 100_000, outcome: resolved },
      { decision: 'rejected', expectedGainCents: 900_000, outcome: rejected },
    ]);

    // 900 000 refusés ne sont pas un gain : ils n'ont jamais été engagés.
    expect(stats.expectedGainCents).toBe(100_000);
  });

  it('renvoie des compteurs à zéro sur une liste vide', () => {
    expect(summarizeDecisions([])).toEqual({
      total: 0,
      approved: 0,
      rejected: 0,
      resolvedAfterApproval: 0,
      expectedGainCents: 0,
    });
  });
});
