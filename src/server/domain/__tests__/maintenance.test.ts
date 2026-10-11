import { describe, expect, it } from 'vitest';
import { computeFailurePareto, parisLocalDateTime, shiftAt } from '../maintenance';

describe('computeFailurePareto', () => {
  it('classe les causes par durée et calcule leur part cumulée', () => {
    const result = computeFailurePareto([
      { rootCause: 'Capteur', title: 'A', downtimeMinutes: 40, estimatedCostCents: 100 },
      { rootCause: 'capteur', title: 'B', downtimeMinutes: 20, estimatedCostCents: 50 },
      { rootCause: 'Matière', title: 'C', downtimeMinutes: 40, estimatedCostCents: 70 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ cause: 'Capteur', incidents: 2, downtimeMinutes: 60 });
    expect(result[0].sharePct).toBeCloseTo(60);
    expect(result[1].cumulativePct).toBeCloseTo(100);
  });

  it('rend visible la dette de diagnostic', () => {
    const [row] = computeFailurePareto([
      { rootCause: null, title: 'Arrêt', downtimeMinutes: 15, estimatedCostCents: 0 },
    ]);
    expect(row.cause).toBe('Cause non renseignée');
  });
});

describe('planning maintenance Europe/Paris', () => {
  it('convertit correctement une heure d’été en UTC', () => {
    expect(parisLocalDateTime('2026-08-12T14:30')?.toISOString()).toBe('2026-08-12T12:30:00.000Z');
  });

  it('identifie l’équipe active', () => {
    expect(shiftAt(new Date('2026-08-12T12:30:00.000Z'))).toBe('afternoon');
  });
});
