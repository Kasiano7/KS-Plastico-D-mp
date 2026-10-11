import { describe, expect, it } from 'vitest';
import { computeDowntimeImpact, computeProfitability, computeUnitCost } from '../costing';

describe('computeProfitability', () => {
  it('applique la formule de rentabilité sur coût du cahier des charges', () => {
    // Coût 10 €, vente 20 € → bénéfice 10 €, rentabilité 100 %.
    const result = computeProfitability(1_000, 2_000, 5_000);

    expect(result.unitMarginCents).toBe(1_000);
    expect(result.returnOnCostPct).toBe(100);
    expect(result.marginPct).toBe(50);
    expect(result.contributionCents).toBe(5_000_000);
  });

  it('renvoie une marge négative pour une référence vendue à perte', () => {
    const result = computeProfitability(2_500, 2_000);
    expect(result.unitMarginCents).toBe(-500);
    expect(result.returnOnCostPct).toBe(-20);
  });

  it('ne divise pas par zéro lorsque le coût est inconnu', () => {
    expect(computeProfitability(0, 2_000).returnOnCostPct).toBe(0);
  });
});

describe('computeUnitCost', () => {
  const base = {
    weightGrams: 2_450,
    materialCostCentsPerKg: 180,
    cycleTimeSeconds: 120,
    cavities: 1,
    machineHourlyCostCents: 6_500,
    laborHourlyCostCents: 2_400,
    overheadHourlyCostCents: 1_500,
    consumablesHourlyCostCents: 300,
  };

  it('ventile le coût de revient par poste', () => {
    const cost = computeUnitCost(base);

    // 2,45 kg × 1,80 € = 4,41 €
    expect(cost.materialCents).toBe(441);
    // 120 s = 1/30 h → 65 € / 30 = 2,17 €
    expect(cost.machineCents).toBe(217);
    expect(cost.totalCents).toBe(
      cost.materialCents + cost.machineCents + cost.laborCents + cost.overheadCents + cost.consumablesCents,
    );
  });

  it('divise le temps machine par le nombre d’empreintes', () => {
    const single = computeUnitCost(base);
    const quad = computeUnitCost({ ...base, cavities: 4 });

    expect(quad.machineCents).toBe(Math.round(single.machineCents / 4));
    expect(quad.materialCents).toBe(single.materialCents);
  });

  it('reporte le coût des pièces rebutées sur les pièces bonnes', () => {
    const withoutScrap = computeUnitCost(base);
    const withScrap = computeUnitCost({ ...base, scrapRate: 0.05 });

    expect(withScrap.scrapCents).toBeGreaterThan(0);
    expect(withScrap.totalCents).toBeGreaterThan(withoutScrap.totalCents);
  });
});

describe('computeDowntimeImpact', () => {
  it('convertit un arrêt machine en euros', () => {
    const impact = computeDowntimeImpact({
      downtimeMinutes: 133, // 2 h 13
      unitsPerHour: 334,
      unitPriceCents: 1_140,
      unitCostCents: 700,
      idleOperators: 2,
      operatorHourlyCostCents: 2_800,
      machineHourlyCostCents: 6_500,
      ordersAtRisk: 3,
    });

    expect(impact.lostUnits).toBe(740);
    expect(impact.lostRevenueCents).toBe(843_600);
    expect(impact.totalCents).toBe(
      impact.lostMarginCents + impact.idleLaborCents + impact.idleMachineCents,
    );
    expect(impact.ordersAtRisk).toBe(3);
  });

  it('ne produit jamais de marge perdue négative', () => {
    const impact = computeDowntimeImpact({
      downtimeMinutes: 60,
      unitsPerHour: 100,
      unitPriceCents: 500,
      unitCostCents: 900,
      idleOperators: 0,
      operatorHourlyCostCents: 0,
      machineHourlyCostCents: 0,
    });

    expect(impact.lostMarginCents).toBe(0);
    expect(impact.totalCents).toBe(0);
  });
});
