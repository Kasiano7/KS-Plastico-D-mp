import { describe, expect, it } from 'vitest';
import { assessFeasibility, computeOrderProgress, estimateDelayRisk, riskSeverity } from '../orders';

describe('computeOrderProgress', () => {
  it('calcule la progression du parcours de référence : 10 000 pièces, 2 000 en stock', () => {
    const progress = computeOrderProgress([
      { quantityUnits: 10_000, reservedUnits: 2_000, producedUnits: 0, unitsPerPallet: 1_000 },
    ]);

    expect(progress.coveredUnits).toBe(2_000);
    expect(progress.remainingUnits).toBe(8_000);
    expect(progress.progressPct).toBe(20);
    expect(progress.palletsRequired).toBe(10);
    expect(progress.palletsReady).toBe(2);
    expect(progress.isComplete).toBe(false);
  });

  it('ne compte que les palettes complètes', () => {
    const progress = computeOrderProgress([
      { quantityUnits: 1_000, reservedUnits: 0, producedUnits: 649, unitsPerPallet: 100 },
    ]);

    expect(progress.palletsReady).toBe(6);
  });

  it('marque la commande terminée à 10/10', () => {
    const progress = computeOrderProgress([
      { quantityUnits: 10_000, reservedUnits: 2_000, producedUnits: 8_000, unitsPerPallet: 1_000 },
    ]);

    expect(progress.isComplete).toBe(true);
    expect(progress.progressPct).toBe(100);
    expect(progress.palletsReady).toBe(10);
  });

  it('ne dépasse jamais 100 % en cas de surproduction', () => {
    const progress = computeOrderProgress([
      { quantityUnits: 1_000, reservedUnits: 0, producedUnits: 1_500, unitsPerPallet: 100 },
    ]);

    expect(progress.progressPct).toBe(100);
    expect(progress.palletsReady).toBe(10);
  });

  it('agrège plusieurs lignes de commande', () => {
    const progress = computeOrderProgress([
      { quantityUnits: 500, reservedUnits: 500, producedUnits: 0, unitsPerPallet: 100 },
      { quantityUnits: 500, reservedUnits: 0, producedUnits: 0, unitsPerPallet: 100 },
    ]);

    expect(progress.quantityUnits).toBe(1_000);
    expect(progress.progressPct).toBe(50);
    expect(progress.palletsRequired).toBe(10);
  });
});

describe('estimateDelayRisk', () => {
  it('renvoie un risque faible quand la capacité est largement suffisante', () => {
    const risk = estimateDelayRisk({ remainingUnits: 1_000, unitsPerHour: 200, availableHours: 40 });

    expect(risk.requiredHours).toBe(5);
    expect(risk.missingHours).toBe(0);
    expect(risk.riskPct).toBeLessThan(15);
    expect(risk.severity).toBe('normal');
  });

  it('chiffre le déficit de capacité — 7 h 20 nécessaires pour 5 h 40 disponibles', () => {
    const risk = estimateDelayRisk({ remainingUnits: 733, unitsPerHour: 100, availableHours: 5.67 });

    expect(risk.requiredHours).toBeCloseTo(7.33, 2);
    expect(risk.missingHours).toBeCloseTo(1.66, 2);
    expect(risk.riskPct).toBeGreaterThan(15);
    expect(risk.reasons[0]).toContain('Capacité insuffisante');
  });

  it('cumule les pénalités machine, matière et effectif sans dépasser 99 %', () => {
    const risk = estimateDelayRisk({
      remainingUnits: 10_000,
      unitsPerHour: 100,
      availableHours: 1,
      blockedMachines: 2,
      materialShortage: true,
      staffShortage: true,
    });

    expect(risk.riskPct).toBe(99);
    expect(risk.severity).toBe('critical');
    expect(risk.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('considère une capacité nulle comme quasi certaine de retard', () => {
    const risk = estimateDelayRisk({ remainingUnits: 100, unitsPerHour: 100, availableHours: 0 });
    expect(risk.riskPct).toBe(95);
  });
});

describe('riskSeverity', () => {
  it('mappe le risque sur les quatre niveaux de sévérité', () => {
    expect(riskSeverity(5)).toBe('normal');
    expect(riskSeverity(23)).toBe('warning');
    expect(riskSeverity(37)).toBe('warning');
    expect(riskSeverity(75)).toBe('critical');
  });
});

describe('assessFeasibility', () => {
  it('bloque la commande dès qu’un contrôle est bloquant', () => {
    const risk = estimateDelayRisk({ remainingUnits: 1_000, unitsPerHour: 200, availableHours: 40 });
    const result = assessFeasibility(risk, [
      { key: 'material', label: 'Matière', status: 'ok', detail: 'Couverte' },
      { key: 'planning', label: 'Planning', status: 'blocked', detail: 'Aucun créneau' },
    ]);

    expect(result.verdict).toBe('not_feasible');
  });

  it('renvoie « réalisable avec risque » quand un contrôle est en alerte', () => {
    const risk = estimateDelayRisk({ remainingUnits: 1_000, unitsPerHour: 200, availableHours: 40 });
    const result = assessFeasibility(risk, [
      { key: 'material', label: 'Matière', status: 'ok', detail: 'Couverte' },
      { key: 'staff', label: 'Personnel', status: 'warning', detail: 'Effectif juste' },
    ]);

    expect(result.verdict).toBe('feasible_with_risk');
  });
});
