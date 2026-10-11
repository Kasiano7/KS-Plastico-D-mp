/** Utilitaires numériques partagés par le domaine. Aucune dépendance. */

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

export function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Division sûre : renvoie `fallback` plutôt que NaN/Infinity. */
export function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator) return fallback;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : fallback;
}

export function percent(numerator: number, denominator: number, decimals = 0): number {
  return round(safeDivide(numerator, denominator) * 100, decimals);
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
