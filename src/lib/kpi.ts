import type { Severity } from '@/types/dashboard';

/**
 * Seuils d'interprétation, purs et testables.
 *
 * Ils vivent ici et non dans les composants : un seuil est une règle métier,
 * pas une décision de mise en page. Le jour où la direction décide qu'une
 * journée à 88 % n'est plus « normale », un seul fichier change.
 */

/** Avancement d'un objectif de production, en pourcentage. */
export function completionSeverity(completionPct: number): Severity {
  if (completionPct >= 90) return 'success';
  if (completionPct >= 75) return 'warning';
  return 'critical';
}

/**
 * Perte de production imputée à un arrêt machine, en unités (valeur négative).
 * Au-delà d'un quart d'équipe perdu, ce n'est plus un aléa : c'est un sujet.
 */
export function lostUnitsSeverity(lostUnits: number): Severity {
  return lostUnits <= -250 ? 'critical' : 'warning';
}

/**
 * Une variation n'a pas de sens en soi : −0,3 pt de rebut est une bonne
 * nouvelle, −2,1 % de taux de service n'en est pas une. C'est la donnée qui
 * porte l'interprétation, cette fonction ne fait que la traduire.
 * `'neutral'` couvre le cas où l'historique est encore insuffisant pour
 * calculer un écart réel : on ne l'affiche jamais en positif ni en négatif.
 */
export function deltaSeverity(meaning: 'positive' | 'negative' | 'neutral'): Severity {
  if (meaning === 'positive') return 'success';
  if (meaning === 'negative') return 'warning';
  return 'info';
}
