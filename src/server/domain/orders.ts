/**
 * Règles commande client (§17, §18).
 *
 * La progression d'une commande combine deux sources : le stock déjà réservé et
 * la production réellement déclarée. Une palette n'est comptée que lorsqu'elle
 * est complète et affectée à la commande.
 */

import { clamp, percent, round, safeDivide } from './math';

export type OrderLineInput = {
  quantityUnits: number;
  reservedUnits: number;
  producedUnits: number;
  unitsPerPallet: number;
};

export type OrderProgress = {
  quantityUnits: number;
  coveredUnits: number;
  remainingUnits: number;
  progressPct: number;
  palletsRequired: number;
  palletsReady: number;
  isComplete: boolean;
};

export function computeOrderProgress(lines: readonly OrderLineInput[]): OrderProgress {
  const quantityUnits = lines.reduce((total, line) => total + line.quantityUnits, 0);
  const coveredUnits = lines.reduce(
    (total, line) => total + Math.min(line.reservedUnits + line.producedUnits, line.quantityUnits),
    0,
  );
  const palletsRequired = lines.reduce(
    (total, line) => total + Math.ceil(safeDivide(line.quantityUnits, line.unitsPerPallet)),
    0,
  );
  const palletsReady = lines.reduce(
    (total, line) =>
      total +
      Math.min(
        Math.floor(safeDivide(line.reservedUnits + line.producedUnits, line.unitsPerPallet)),
        Math.ceil(safeDivide(line.quantityUnits, line.unitsPerPallet)),
      ),
    0,
  );

  return {
    quantityUnits,
    coveredUnits,
    remainingUnits: Math.max(quantityUnits - coveredUnits, 0),
    progressPct: percent(coveredUnits, quantityUnits),
    palletsRequired,
    palletsReady,
    isComplete: quantityUnits > 0 && coveredUnits >= quantityUnits,
  };
}

export type DelayRiskInput = {
  remainingUnits: number;
  /** Cadence retenue sur la ou les machines affectées, en pièces/heure. */
  unitsPerHour: number;
  /** Heures de production réellement disponibles avant l'échéance. */
  availableHours: number;
  /** Machines nécessaires actuellement à l'arrêt. */
  blockedMachines?: number;
  /** Vrai si la matière ou les palettes ne couvrent pas le besoin. */
  materialShortage?: boolean;
  /** Vrai si l'effectif prévu n'est pas couvert. */
  staffShortage?: boolean;
};

export type DelayRisk = {
  /** Probabilité de retard, de 0 à 100. */
  riskPct: number;
  requiredHours: number;
  availableHours: number;
  /** Heures manquantes (0 si la capacité suffit). */
  missingHours: number;
  severity: 'normal' | 'info' | 'warning' | 'critical';
  reasons: string[];
};

/**
 * Modèle de risque de retard, déterministe et explicable.
 * Volontairement simple en V1 : la capacité manquante domine, les autres
 * facteurs ajoutent une pénalité bornée. Chaque facteur est restitué à
 * l'utilisateur — l'application doit expliquer, pas seulement afficher (§15).
 */
export function estimateDelayRisk(input: DelayRiskInput): DelayRisk {
  const requiredHours = round(safeDivide(input.remainingUnits, input.unitsPerHour), 2);
  const availableHours = round(input.availableHours, 2);
  const missingHours = round(Math.max(requiredHours - availableHours, 0), 2);

  const reasons: string[] = [];
  let risk = 0;

  if (requiredHours > 0 && availableHours <= 0) {
    risk = 95;
    reasons.push("Aucune capacité disponible avant l'échéance.");
  } else if (missingHours > 0) {
    const deficitRatio = clamp(safeDivide(missingHours, requiredHours), 0, 1);
    risk = round(deficitRatio * 90);
    reasons.push(
      `Capacité insuffisante : ${requiredHours.toLocaleString('fr-FR')} h nécessaires pour ${availableHours.toLocaleString('fr-FR')} h disponibles.`,
    );
  } else {
    // Marge faible = risque résiduel : un aléa suffit à faire basculer la commande.
    const margin = clamp(safeDivide(availableHours - requiredHours, Math.max(availableHours, 1)), 0, 1);
    risk = round((1 - margin) * 25);
    if (margin < 0.2) reasons.push("Marge de capacité faible avant l'échéance.");
  }

  if (input.blockedMachines && input.blockedMachines > 0) {
    risk += 20 * input.blockedMachines;
    reasons.push(
      `${input.blockedMachines} machine(s) nécessaire(s) actuellement à l'arrêt.`,
    );
  }
  if (input.materialShortage) {
    risk += 15;
    reasons.push('Matière ou palettes insuffisantes pour couvrir le besoin.');
  }
  if (input.staffShortage) {
    risk += 10;
    reasons.push("Effectif incomplet sur la période de production.");
  }

  const riskPct = clamp(round(risk), 0, 99);

  return {
    riskPct,
    requiredHours,
    availableHours,
    missingHours,
    severity: riskSeverity(riskPct),
    reasons: reasons.length > 0 ? reasons : ['Capacité, matière et effectif couvrent le besoin.'],
  };
}

/**
 * Seuils alignés sur les exemples du cahier des charges : une commande à 23 %
 * ou 37 % de risque est affichée en orange, jamais en rouge (§11, §18).
 */
export function riskSeverity(riskPct: number): 'normal' | 'info' | 'warning' | 'critical' {
  if (riskPct >= 60) return 'critical';
  if (riskPct >= 20) return 'warning';
  if (riskPct >= 10) return 'info';
  return 'normal';
}

export type FeasibilityCheck = {
  key: 'material' | 'pallets' | 'machine' | 'staff' | 'planning';
  label: string;
  status: 'ok' | 'warning' | 'blocked';
  detail: string;
};

export type FeasibilityResult = {
  verdict: 'feasible' | 'feasible_with_risk' | 'not_feasible';
  riskPct: number;
  checks: FeasibilityCheck[];
  requiredHours: number;
  availableHours: number;
};

/** Analyse de faisabilité d'une commande (§18) — agrège les contrôles métier. */
export function assessFeasibility(
  risk: DelayRisk,
  checks: readonly FeasibilityCheck[],
): FeasibilityResult {
  const blocked = checks.some((check) => check.status === 'blocked');
  const warned = checks.some((check) => check.status === 'warning');

  const verdict: FeasibilityResult['verdict'] = blocked
    ? 'not_feasible'
    : warned || risk.riskPct >= 20
      ? 'feasible_with_risk'
      : 'feasible';

  return {
    verdict,
    riskPct: risk.riskPct,
    checks: [...checks],
    requiredHours: risk.requiredHours,
    availableHours: risk.availableHours,
  };
}
