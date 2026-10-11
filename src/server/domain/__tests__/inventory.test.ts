import { describe, expect, it } from 'vitest';
import {
  applyReservation,
  availableQuantity,
  planReservation,
  projectStock,
  releaseReservation,
  suggestPurchase,
} from '../inventory';

describe('availableQuantity', () => {
  it('exclut les quantités réservées et le stock de sécurité', () => {
    expect(availableQuantity({ quantityOnHand: 300, quantityReserved: 50, safetyStock: 30 })).toBe(220);
  });

  it('ne descend jamais sous zéro', () => {
    expect(availableQuantity({ quantityOnHand: 10, quantityReserved: 20, safetyStock: 5 })).toBe(0);
  });
});

describe('planReservation', () => {
  it('réserve tout le besoin quand le stock suffit', () => {
    const plan = planReservation({ quantityOnHand: 500, quantityReserved: 0, safetyStock: 0 }, 200);
    expect(plan).toEqual({ reserved: 200, missing: 0, fullyCovered: true });
  });

  it('réserve partiellement et indique le reste à produire — scénario 2/10 palettes', () => {
    const plan = planReservation({ quantityOnHand: 2, quantityReserved: 0, safetyStock: 0 }, 10);
    expect(plan).toEqual({ reserved: 2, missing: 8, fullyCovered: false });
  });

  it("ne réserve rien lorsque tout le stock est déjà promis à d'autres commandes", () => {
    const plan = planReservation({ quantityOnHand: 100, quantityReserved: 100, safetyStock: 0 }, 50);
    expect(plan.reserved).toBe(0);
    expect(plan.missing).toBe(50);
  });
});

describe('applyReservation / releaseReservation', () => {
  it('rend la quantité réservée indisponible pour une seconde commande', () => {
    const initial = { quantityOnHand: 10, quantityReserved: 0, safetyStock: 0 };
    const afterFirst = applyReservation(initial, 8);

    expect(afterFirst.quantityReserved).toBe(8);
    expect(availableQuantity(afterFirst)).toBe(2);
    expect(planReservation(afterFirst, 5).reserved).toBe(2);
  });

  it('libère une réservation sans jamais passer en négatif', () => {
    const level = { quantityOnHand: 10, quantityReserved: 3, safetyStock: 0 };
    expect(releaseReservation(level, 10).quantityReserved).toBe(0);
  });
});

describe('projectStock', () => {
  it('projette la rupture de palettes du scénario de référence', () => {
    const projection = projectStock({
      level: { quantityOnHand: 300, quantityReserved: 0, safetyStock: 0 },
      averageDailyConsumption: 150,
      horizonDays: 4,
    });

    expect(projection.days.map((day) => day.projectedOnHand)).toEqual([300, 150, 0, -150, -300]);
    expect(projection.shortageInDays).toBe(3);
    expect(projection.coverageDays).toBe(2);
  });

  it('prend en compte les entrées prévues', () => {
    const projection = projectStock({
      level: { quantityOnHand: 300, quantityReserved: 0, safetyStock: 0 },
      averageDailyConsumption: 150,
      expectedInbound: [{ inDays: 2, quantity: 800 }],
      horizonDays: 4,
    });

    expect(projection.shortageInDays).toBeNull();
  });
});

describe('suggestPurchase', () => {
  it('propose une quantité couvrant le déficit et la cible de couverture', () => {
    const projection = projectStock({
      level: { quantityOnHand: 300, quantityReserved: 0, safetyStock: 0 },
      averageDailyConsumption: 150,
      horizonDays: 4,
    });

    const suggestion = suggestPurchase(projection, {
      averageDailyConsumption: 150,
      supplierLeadTimeDays: 2,
      packSize: 100,
      coverageTargetDays: 7,
    });

    expect(suggestion).not.toBeNull();
    expect(suggestion!.requiredQuantity).toBe(300);
    expect(suggestion!.recommendedQuantity).toBe(1400);
    expect(suggestion!.orderByInDays).toBe(1);
  });

  it('ne propose rien lorsque aucune rupture n’est projetée', () => {
    const projection = projectStock({
      level: { quantityOnHand: 1000, quantityReserved: 0, safetyStock: 0 },
      averageDailyConsumption: 10,
      horizonDays: 7,
    });

    expect(suggestPurchase(projection, { averageDailyConsumption: 10, supplierLeadTimeDays: 3 })).toBeNull();
  });
});
