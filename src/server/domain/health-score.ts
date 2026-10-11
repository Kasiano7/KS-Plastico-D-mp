/**
 * Score de santé de l'usine (§9).
 *
 * Fonction pure : mêmes entrées, même score. Les pondérations sont
 * configurables afin qu'une direction puisse décider de ce qui compte le plus.
 * Chaque sous-score est accompagné de son explication en clair — l'application
 * ne se contente jamais d'afficher un nombre (§15).
 */

import { clamp, round } from './math';

export const HEALTH_DIMENSIONS = [
  'production',
  'inventory',
  'machines',
  'planning',
  'quality',
  'staff',
] as const;

export type HealthDimension = (typeof HEALTH_DIMENSIONS)[number];

export const HEALTH_LABELS: Record<HealthDimension, string> = {
  production: 'Production',
  inventory: 'Stocks',
  machines: 'Machines',
  planning: 'Planning',
  quality: 'Qualité',
  staff: 'Personnel',
};

export type HealthWeights = Record<HealthDimension, number>;

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  production: 0.25,
  machines: 0.2,
  planning: 0.15,
  inventory: 0.15,
  quality: 0.15,
  staff: 0.1,
};

export type HealthInput = {
  production: {
    producedUnits: number;
    targetUnits: number;
  };
  machines: {
    /** Machines actives, hors machines désactivées. */
    total: number;
    /** Machines en arrêt subi ou en défaut au moment du calcul. */
    down: number;
    /** Minutes d'arrêt cumulées sur la période observée. */
    downtimeMinutes: number;
    /** Minutes planifiées cumulées sur la période observée. */
    plannedMinutes: number;
  };
  inventory: {
    /** Articles suivis (hors articles inactifs). */
    trackedItems: number;
    /** Articles sous le point de commande. */
    belowReorderPoint: number;
    /** Articles en rupture projetée sous 72 h. */
    projectedShortages: number;
  };
  planning: {
    activeOrders: number;
    ordersAtRisk: number;
    ordersLate: number;
  };
  quality: {
    goodUnits: number;
    rejectedUnits: number;
  };
  staff: {
    required: number;
    present: number;
    /** Habilitations expirant dans la fenêtre d'alerte. */
    expiringQualifications: number;
  };
};

export type HealthDimensionResult = {
  dimension: HealthDimension;
  label: string;
  score: number;
  weight: number;
  explanation: string;
};

export type HealthResult = {
  global: number;
  dimensions: HealthDimensionResult[];
  /** Dimensions qui tirent le score vers le bas, la plus pénalisante d'abord. */
  weakest: HealthDimensionResult[];
};

function ratioScore(numerator: number, denominator: number, fallback = 100): number {
  if (denominator <= 0) return fallback;
  return clamp(round((numerator / denominator) * 100), 0, 100);
}

function productionScore(input: HealthInput['production']): HealthDimensionResult {
  const score = ratioScore(input.producedUnits, input.targetUnits);
  const pct = input.targetUnits > 0 ? round((input.producedUnits / input.targetUnits) * 100) : 100;
  return {
    dimension: 'production',
    label: HEALTH_LABELS.production,
    score,
    weight: 0,
    explanation:
      input.targetUnits > 0
        ? `${input.producedUnits.toLocaleString('fr-FR')} pièces produites sur un objectif de ${input.targetUnits.toLocaleString('fr-FR')} (${pct} %).`
        : 'Aucun objectif de production défini sur la période.',
  };
}

function machineScore(input: HealthInput['machines']): HealthDimensionResult {
  const availability = input.plannedMinutes > 0 ? 1 - input.downtimeMinutes / input.plannedMinutes : 1;
  // Une machine à l'arrêt pèse plus lourd que le seul temps perdu : elle bloque
  // aussi le planning. On applique donc une pénalité par machine arrêtée.
  const downPenalty = input.total > 0 ? (input.down / input.total) * 40 : 0;
  const score = clamp(round(clamp(availability, 0, 1) * 100 - downPenalty), 0, 100);
  const downtimeHours = round(input.downtimeMinutes / 60, 1);
  return {
    dimension: 'machines',
    label: HEALTH_LABELS.machines,
    score,
    weight: 0,
    explanation:
      input.down > 0
        ? `${input.down} machine${input.down > 1 ? 's' : ''} à l'arrêt sur ${input.total}, ${downtimeHours} h d'arrêt cumulées.`
        : `Aucun arrêt subi en cours, ${downtimeHours} h d'arrêt cumulées sur la période.`,
  };
}

function inventoryScore(input: HealthInput['inventory']): HealthDimensionResult {
  if (input.trackedItems <= 0) {
    return {
      dimension: 'inventory',
      label: HEALTH_LABELS.inventory,
      score: 100,
      weight: 0,
      explanation: 'Aucun article suivi.',
    };
  }
  const belowRatio = input.belowReorderPoint / input.trackedItems;
  const shortageRatio = input.projectedShortages / input.trackedItems;
  const score = clamp(round(100 - belowRatio * 45 - shortageRatio * 55), 0, 100);
  const parts: string[] = [];
  if (input.belowReorderPoint > 0) parts.push(`${input.belowReorderPoint} article(s) sous le point de commande`);
  if (input.projectedShortages > 0) parts.push(`${input.projectedShortages} rupture(s) projetée(s) sous 72 h`);
  return {
    dimension: 'inventory',
    label: HEALTH_LABELS.inventory,
    score,
    weight: 0,
    explanation: parts.length > 0 ? `${parts.join(', ')}.` : 'Tous les articles sont au-dessus de leur point de commande.',
  };
}

function planningScore(input: HealthInput['planning']): HealthDimensionResult {
  if (input.activeOrders <= 0) {
    return {
      dimension: 'planning',
      label: HEALTH_LABELS.planning,
      score: 100,
      weight: 0,
      explanation: 'Aucune commande active.',
    };
  }
  const riskRatio = input.ordersAtRisk / input.activeOrders;
  const lateRatio = input.ordersLate / input.activeOrders;
  const score = clamp(round(100 - riskRatio * 40 - lateRatio * 80), 0, 100);
  return {
    dimension: 'planning',
    label: HEALTH_LABELS.planning,
    score,
    weight: 0,
    explanation:
      input.ordersAtRisk + input.ordersLate > 0
        ? `${input.ordersAtRisk} commande(s) à risque et ${input.ordersLate} en retard sur ${input.activeOrders} actives.`
        : `Les ${input.activeOrders} commandes actives sont dans les délais.`,
  };
}

function qualityScore(input: HealthInput['quality']): HealthDimensionResult {
  const total = input.goodUnits + input.rejectedUnits;
  const score = ratioScore(input.goodUnits, total);
  const rejectRate = total > 0 ? round((input.rejectedUnits / total) * 100, 2) : 0;
  return {
    dimension: 'quality',
    label: HEALTH_LABELS.quality,
    score,
    weight: 0,
    explanation:
      total > 0
        ? `Taux de rebut de ${rejectRate.toLocaleString('fr-FR')} % sur ${total.toLocaleString('fr-FR')} pièces contrôlées.`
        : 'Aucune pièce déclarée sur la période.',
  };
}

function staffScore(input: HealthInput['staff']): HealthDimensionResult {
  const presence = input.required > 0 ? clamp(input.present / input.required, 0, 1) : 1;
  const qualificationPenalty = Math.min(input.expiringQualifications * 3, 20);
  const score = clamp(round(presence * 100 - qualificationPenalty), 0, 100);
  const missing = Math.max(input.required - input.present, 0);
  const parts: string[] = [];
  if (missing > 0) parts.push(`${missing} poste(s) non couvert(s) sur ${input.required}`);
  if (input.expiringQualifications > 0)
    parts.push(`${input.expiringQualifications} habilitation(s) bientôt expirée(s)`);
  return {
    dimension: 'staff',
    label: HEALTH_LABELS.staff,
    score,
    weight: 0,
    explanation: parts.length > 0 ? `${parts.join(', ')}.` : 'Effectif complet et habilitations à jour.',
  };
}

export function computeFactoryHealth(
  input: HealthInput,
  weights: HealthWeights = DEFAULT_HEALTH_WEIGHTS,
): HealthResult {
  const dimensions: HealthDimensionResult[] = [
    productionScore(input.production),
    inventoryScore(input.inventory),
    machineScore(input.machines),
    planningScore(input.planning),
    qualityScore(input.quality),
    staffScore(input.staff),
  ].map((result) => ({ ...result, weight: weights[result.dimension] ?? 0 }));

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const global =
    totalWeight > 0
      ? clamp(round(dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) / totalWeight), 0, 100)
      : 0;

  const weakest = [...dimensions]
    .filter((d) => d.score < 90)
    .sort((a, b) => a.score * a.weight - b.score * b.weight);

  return { global, dimensions, weakest };
}

/** Traduit un score en sévérité, pour piloter la couleur de manière cohérente. */
export function healthSeverity(score: number): 'normal' | 'info' | 'warning' | 'critical' {
  if (score >= 85) return 'normal';
  if (score >= 70) return 'info';
  if (score >= 55) return 'warning';
  return 'critical';
}

/** Explique une variation de score entre deux relevés (§9). */
export function explainHealthVariation(previous: HealthResult, current: HealthResult): string {
  const delta = current.global - previous.global;
  if (delta === 0) return 'Score stable par rapport au relevé précédent.';

  const contributions = current.dimensions.map((dimension) => {
    const before = previous.dimensions.find((d) => d.dimension === dimension.dimension);
    return {
      dimension,
      delta: (dimension.score - (before?.score ?? dimension.score)) * dimension.weight,
    };
  });

  const driver = contributions.sort((a, b) =>
    delta < 0 ? a.delta - b.delta : b.delta - a.delta,
  )[0];

  const direction = delta > 0 ? 'en hausse' : 'en baisse';
  return `Score ${direction} de ${Math.abs(delta)} point${Math.abs(delta) > 1 ? 's' : ''}. Principal facteur : ${driver.dimension.label.toLowerCase()} — ${driver.dimension.explanation}`;
}
