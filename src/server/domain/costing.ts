/**
 * Coûts, rentabilité et impact financier (§16, §33).
 *
 * Toutes les valeurs monétaires sont des entiers en **centimes d'euro**.
 * Aucun flottant n'est utilisé pour l'argent : les arrondis restent maîtrisés
 * et les totaux sont exacts.
 */

import { round, safeDivide } from './math';

/**
 * Coût horaire chargé d'un opérateur mobilisé sans produire, faute d'un coût
 * réel saisi par machine ou par atelier. Centralisé ici pour ne pas driver
 * silencieusement entre les deux endroits qui calculent un impact d'arrêt.
 */
export const DEFAULT_OPERATOR_HOURLY_COST_CENTS = 3_000;

export type UnitCostInput = {
  /** Poids de la pièce en grammes. */
  weightGrams: number;
  /** Coût matière en centimes par kilogramme. */
  materialCostCentsPerKg: number;
  /** Temps de cycle en secondes. */
  cycleTimeSeconds: number;
  /** Nombre d'empreintes du moule : divise le temps machine par pièce. */
  cavities: number;
  /** Coût horaire machine (amortissement + énergie machine). */
  machineHourlyCostCents: number;
  /** Coût horaire main-d'œuvre affectée. */
  laborHourlyCostCents: number;
  /** Frais généraux horaires. */
  overheadHourlyCostCents: number;
  /** Consommables horaires. */
  consumablesHourlyCostCents: number;
  /** Taux de rebut attendu, de 0 à 1 : les pièces rebutées sont refacturées aux bonnes. */
  scrapRate?: number;
};

export type UnitCostBreakdown = {
  materialCents: number;
  machineCents: number;
  laborCents: number;
  overheadCents: number;
  consumablesCents: number;
  scrapCents: number;
  totalCents: number;
  /** Heures machine consommées par pièce. */
  machineHoursPerUnit: number;
};

export function computeUnitCost(input: UnitCostInput): UnitCostBreakdown {
  const cavities = Math.max(input.cavities, 1);
  const machineHoursPerUnit = safeDivide(input.cycleTimeSeconds, 3600 * cavities);

  const materialCents = (input.weightGrams / 1000) * input.materialCostCentsPerKg;
  const machineCents = machineHoursPerUnit * input.machineHourlyCostCents;
  const laborCents = machineHoursPerUnit * input.laborHourlyCostCents;
  const overheadCents = machineHoursPerUnit * input.overheadHourlyCostCents;
  const consumablesCents = machineHoursPerUnit * input.consumablesHourlyCostCents;

  const directCents = materialCents + machineCents + laborCents + overheadCents + consumablesCents;
  const scrapRate = Math.min(Math.max(input.scrapRate ?? 0, 0), 0.5);
  // Une pièce rebutée a coûté sa fabrication : on répartit ce coût sur les bonnes.
  const scrapCents = directCents * safeDivide(scrapRate, 1 - scrapRate);

  return {
    materialCents: Math.round(materialCents),
    machineCents: Math.round(machineCents),
    laborCents: Math.round(laborCents),
    overheadCents: Math.round(overheadCents),
    consumablesCents: Math.round(consumablesCents),
    scrapCents: Math.round(scrapCents),
    totalCents: Math.round(directCents + scrapCents),
    machineHoursPerUnit: round(machineHoursPerUnit, 6),
  };
}

export type Profitability = {
  unitCostCents: number;
  unitPriceCents: number;
  unitMarginCents: number;
  /** Rentabilité sur coût : ((prix − coût) / coût) × 100. */
  returnOnCostPct: number;
  /** Marge commerciale : ((prix − coût) / prix) × 100. */
  marginPct: number;
  contributionCents: number;
};

export function computeProfitability(
  unitCostCents: number,
  unitPriceCents: number,
  volumeUnits = 0,
): Profitability {
  const unitMarginCents = unitPriceCents - unitCostCents;
  return {
    unitCostCents,
    unitPriceCents,
    unitMarginCents,
    returnOnCostPct: round(safeDivide(unitMarginCents, unitCostCents) * 100, 1),
    marginPct: round(safeDivide(unitMarginCents, unitPriceCents) * 100, 1),
    contributionCents: unitMarginCents * volumeUnits,
  };
}

export type DowntimeImpactInput = {
  downtimeMinutes: number;
  /** Cadence nominale de la machine arrêtée, en pièces/heure. */
  unitsPerHour: number;
  unitPriceCents: number;
  unitCostCents: number;
  /** Nombre d'opérateurs immobilisés. */
  idleOperators: number;
  operatorHourlyCostCents: number;
  machineHourlyCostCents: number;
  /** Commandes dont la date de livraison est menacée par cet arrêt. */
  ordersAtRisk?: number;
};

export type DowntimeImpact = {
  lostUnits: number;
  lostRevenueCents: number;
  /** Marge réellement perdue si la production n'est pas rattrapable. */
  lostMarginCents: number;
  idleLaborCents: number;
  idleMachineCents: number;
  totalCents: number;
  ordersAtRisk: number;
};

/**
 * Convertit un arrêt machine en euros (§16).
 * L'impact retenu additionne la marge perdue et les coûts fixes subis :
 * c'est la perte pour l'entreprise, pas le chiffre d'affaires théorique.
 */
export function computeDowntimeImpact(input: DowntimeImpactInput): DowntimeImpact {
  const hours = input.downtimeMinutes / 60;
  const lostUnits = Math.round(hours * input.unitsPerHour);
  const lostRevenueCents = Math.round(lostUnits * input.unitPriceCents);
  const lostMarginCents = Math.round(lostUnits * (input.unitPriceCents - input.unitCostCents));
  const idleLaborCents = Math.round(hours * input.idleOperators * input.operatorHourlyCostCents);
  const idleMachineCents = Math.round(hours * input.machineHourlyCostCents);

  return {
    lostUnits,
    lostRevenueCents,
    lostMarginCents: Math.max(lostMarginCents, 0),
    idleLaborCents,
    idleMachineCents,
    totalCents: Math.max(lostMarginCents, 0) + idleLaborCents + idleMachineCents,
    ordersAtRisk: input.ordersAtRisk ?? 0,
  };
}
