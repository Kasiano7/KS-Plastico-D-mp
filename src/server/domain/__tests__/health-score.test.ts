import { describe, expect, it } from 'vitest';
import {
  computeFactoryHealth,
  explainHealthVariation,
  healthSeverity,
  type HealthInput,
} from '../health-score';

const healthyFactory: HealthInput = {
  production: { producedUnits: 12_000, targetUnits: 12_000 },
  machines: { total: 5, down: 0, downtimeMinutes: 0, plannedMinutes: 6_000 },
  inventory: { trackedItems: 20, belowReorderPoint: 0, projectedShortages: 0 },
  planning: { activeOrders: 12, ordersAtRisk: 0, ordersLate: 0 },
  quality: { goodUnits: 12_000, rejectedUnits: 0 },
  staff: { required: 30, present: 30, expiringQualifications: 0 },
};

describe('computeFactoryHealth', () => {
  it('renvoie 100 sur une usine parfaite', () => {
    const health = computeFactoryHealth(healthyFactory);

    expect(health.global).toBe(100);
    expect(health.weakest).toHaveLength(0);
    expect(health.dimensions).toHaveLength(6);
  });

  it('reste déterministe : deux appels identiques donnent le même score', () => {
    expect(computeFactoryHealth(healthyFactory)).toEqual(computeFactoryHealth(healthyFactory));
  });

  it('fait chuter le score machine quand une presse est à l’arrêt', () => {
    const health = computeFactoryHealth({
      ...healthyFactory,
      machines: { total: 5, down: 1, downtimeMinutes: 72, plannedMinutes: 6_000 },
    });

    const machines = health.dimensions.find((d) => d.dimension === 'machines')!;
    expect(machines.score).toBeLessThan(95);
    expect(machines.explanation).toContain("1 machine à l'arrêt sur 5");
    expect(health.global).toBeLessThan(100);
  });

  it('identifie la dimension la plus pénalisante', () => {
    const health = computeFactoryHealth({
      ...healthyFactory,
      machines: { total: 5, down: 2, downtimeMinutes: 900, plannedMinutes: 6_000 },
      planning: { activeOrders: 12, ordersAtRisk: 3, ordersLate: 0 },
    });

    expect(health.weakest[0].dimension).toBe('machines');
  });

  it('explique chaque sous-score en clair', () => {
    const health = computeFactoryHealth({
      ...healthyFactory,
      inventory: { trackedItems: 20, belowReorderPoint: 3, projectedShortages: 1 },
      staff: { required: 30, present: 28, expiringQualifications: 2 },
    });

    const inventory = health.dimensions.find((d) => d.dimension === 'inventory')!;
    const staff = health.dimensions.find((d) => d.dimension === 'staff')!;

    expect(inventory.explanation).toContain('point de commande');
    expect(staff.explanation).toContain('habilitation');
  });

  it('respecte les pondérations personnalisées', () => {
    const degraded: HealthInput = {
      ...healthyFactory,
      quality: { goodUnits: 5_000, rejectedUnits: 5_000 },
    };

    const defaultWeighted = computeFactoryHealth(degraded);
    const qualityFocused = computeFactoryHealth(degraded, {
      production: 0.1,
      machines: 0.1,
      planning: 0.1,
      inventory: 0.1,
      quality: 0.5,
      staff: 0.1,
    });

    expect(qualityFocused.global).toBeLessThan(defaultWeighted.global);
  });

  it('ne pénalise pas une usine sans objectif défini', () => {
    const health = computeFactoryHealth({
      ...healthyFactory,
      production: { producedUnits: 0, targetUnits: 0 },
    });

    expect(health.dimensions.find((d) => d.dimension === 'production')!.score).toBe(100);
  });
});

describe('healthSeverity', () => {
  it('mappe le score sur les quatre couleurs du design system', () => {
    expect(healthSeverity(92)).toBe('normal');
    expect(healthSeverity(87)).toBe('normal');
    expect(healthSeverity(74)).toBe('info');
    expect(healthSeverity(60)).toBe('warning');
    expect(healthSeverity(40)).toBe('critical');
  });
});

describe('explainHealthVariation', () => {
  it('désigne la cause principale d’une baisse de score', () => {
    const before = computeFactoryHealth(healthyFactory);
    const after = computeFactoryHealth({
      ...healthyFactory,
      machines: { total: 5, down: 2, downtimeMinutes: 1_200, plannedMinutes: 6_000 },
    });

    const explanation = explainHealthVariation(before, after);

    expect(explanation).toContain('en baisse');
    expect(explanation.toLowerCase()).toContain('machines');
  });

  it('reconnaît un score stable', () => {
    const health = computeFactoryHealth(healthyFactory);
    expect(explainHealthVariation(health, health)).toContain('stable');
  });
});
