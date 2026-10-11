/**
 * Règles de stock (§17, §25, §27).
 *
 * Deux invariants gouvernent tout le module :
 *  1. une quantité réservée n'est plus disponible pour une autre commande ;
 *  2. le stock de sécurité n'est jamais compté comme disponible.
 */

import { clamp, round, safeDivide } from './math';

export type StockLevel = {
  quantityOnHand: number;
  quantityReserved: number;
  safetyStock: number;
};

/** Quantité réellement promettable à une nouvelle commande. */
export function availableQuantity(level: StockLevel): number {
  return Math.max(level.quantityOnHand - level.quantityReserved - level.safetyStock, 0);
}

export type ReservationPlan = {
  /** Quantité que l'on peut réserver immédiatement. */
  reserved: number;
  /** Quantité restant à produire. */
  missing: number;
  /** Vrai si le stock couvre intégralement le besoin. */
  fullyCovered: boolean;
};

/**
 * Calcule la réservation à effectuer pour un besoin donné.
 * Ne modifie rien : la persistance est du ressort du service applicatif.
 */
export function planReservation(level: StockLevel, requested: number): ReservationPlan {
  if (requested <= 0) {
    return { reserved: 0, missing: 0, fullyCovered: true };
  }
  const reserved = Math.min(requested, availableQuantity(level));
  const missing = requested - reserved;
  return { reserved, missing, fullyCovered: missing === 0 };
}

/** Applique une réservation à un niveau de stock (fonction pure). */
export function applyReservation(level: StockLevel, quantity: number): StockLevel {
  const reservable = Math.min(Math.max(quantity, 0), availableQuantity(level));
  return { ...level, quantityReserved: level.quantityReserved + reservable };
}

/** Libère une réservation (annulation de commande, arbitrage). */
export function releaseReservation(level: StockLevel, quantity: number): StockLevel {
  const releasable = Math.min(Math.max(quantity, 0), level.quantityReserved);
  return { ...level, quantityReserved: level.quantityReserved - releasable };
}

export type StockProjectionInput = {
  level: StockLevel;
  /** Consommation moyenne journalière prévisionnelle. */
  averageDailyConsumption: number;
  /** Entrées attendues, exprimées en jours à partir d'aujourd'hui. */
  expectedInbound?: { inDays: number; quantity: number }[];
  horizonDays?: number;
};

export type StockProjectionDay = {
  dayOffset: number;
  /** Stock physique projeté. */
  projectedOnHand: number;
  /** Stock disponible projeté (hors réservations et stock de sécurité). */
  projectedAvailable: number;
  isShortage: boolean;
};

export type StockProjection = {
  days: StockProjectionDay[];
  /** Premier jour de rupture projetée, `null` si aucune rupture sur l'horizon. */
  shortageInDays: number | null;
  /** Nombre de jours de couverture au rythme de consommation actuel. */
  coverageDays: number;
};

/**
 * Projection de stock (§27) :
 * `stock actuel + entrées prévues − consommation prévue − réservations + stock sécurité`.
 */
export function projectStock(input: StockProjectionInput): StockProjection {
  const horizon = input.horizonDays ?? 7;
  const inbound = input.expectedInbound ?? [];
  const days: StockProjectionDay[] = [];

  let onHand = input.level.quantityOnHand;
  let shortageInDays: number | null = null;

  for (let day = 0; day <= horizon; day += 1) {
    if (day > 0) {
      onHand -= input.averageDailyConsumption;
      onHand += inbound
        .filter((entry) => entry.inDays === day)
        .reduce((total, entry) => total + entry.quantity, 0);
    }

    const projectedOnHand = round(onHand);
    const projectedAvailable = round(
      onHand - input.level.quantityReserved - input.level.safetyStock,
    );
    const isShortage = projectedAvailable < 0;

    if (isShortage && shortageInDays === null) shortageInDays = day;

    days.push({ dayOffset: day, projectedOnHand, projectedAvailable, isShortage });
  }

  const coverageDays =
    input.averageDailyConsumption > 0
      ? round(safeDivide(availableQuantity(input.level), input.averageDailyConsumption), 1)
      : Number.POSITIVE_INFINITY;

  return { days, shortageInDays, coverageDays };
}

export type PurchaseSuggestion = {
  requiredQuantity: number;
  recommendedQuantity: number;
  orderByInDays: number;
};

/**
 * Suggère un réapprovisionnement couvrant l'horizon plus le délai fournisseur,
 * arrondi à un multiple de conditionnement. Reste une proposition : aucun achat
 * n'est déclenché automatiquement (§13).
 */
export function suggestPurchase(
  projection: StockProjection,
  options: {
    averageDailyConsumption: number;
    supplierLeadTimeDays: number;
    packSize?: number;
    coverageTargetDays?: number;
  },
): PurchaseSuggestion | null {
  if (projection.shortageInDays === null) return null;

  const coverageTarget = options.coverageTargetDays ?? 14;
  const worstDeficit = Math.min(...projection.days.map((day) => day.projectedAvailable), 0);
  const requiredQuantity = Math.ceil(Math.abs(worstDeficit));
  const target = Math.ceil(options.averageDailyConsumption * coverageTarget) + requiredQuantity;
  const packSize = options.packSize ?? 1;
  const recommendedQuantity = Math.ceil(target / packSize) * packSize;

  return {
    requiredQuantity,
    recommendedQuantity,
    orderByInDays: clamp(projection.shortageInDays - options.supplierLeadTimeDays, 0, 365),
  };
}
