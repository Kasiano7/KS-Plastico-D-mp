import type { Severity } from '@/components/ui/severity';

/**
 * Comparaison à la veille.
 *
 * Un directeur d'usine pose trois questions, dans cet ordre : est-ce que je
 * vais livrer, qu'est-ce qui me bloque, et — celle à laquelle l'accueil ne
 * répondait pas — est-ce que ça va mieux qu'hier ? Un chiffre seul ne dit rien
 * de la tendance ; c'est l'écart qui déclenche une question.
 *
 * Deux règles fondent ce module :
 *
 *   1. **Aucun écart inventé.** Sans instantané de la veille, `delta` vaut
 *      `null` et l'écran écrit « pas de référence » plutôt qu'un faux zéro.
 *   2. **Une hausse n'est pas toujours une bonne nouvelle.** Produire plus est
 *      bon ; accumuler des retards ne l'est pas. Le sens est porté par la
 *      métrique, pas par le signe.
 */

/** Sens métier d'une hausse pour la métrique considérée. */
export type DeltaDirection = 'higher-is-better' | 'lower-is-better';

export type DayOverDay = {
  /** `null` quand la veille n'a pas été enregistrée. */
  delta: number | null;
  /** Variation relative en pourcentage, `null` si la veille était à zéro. */
  deltaPct: number | null;
  /** Lecture métier de l'écart, jamais son seul signe. */
  severity: Severity;
};

export function compareToPreviousDay(
  today: number,
  yesterday: number | null | undefined,
  direction: DeltaDirection,
): DayOverDay {
  if (yesterday === null || yesterday === undefined) {
    return { delta: null, deltaPct: null, severity: 'info' };
  }

  const delta = today - yesterday;
  /*
   * Une variation relative à partir de zéro n'a pas de sens mathématique :
   * passer de 0 à 500 n'est pas « +∞ % ». L'écart absolu, lui, reste juste.
   */
  const deltaPct = yesterday === 0 ? null : Math.round((delta / Math.abs(yesterday)) * 100);

  return { delta, deltaPct, severity: severityOf(delta, direction) };
}

function severityOf(delta: number, direction: DeltaDirection): Severity {
  if (delta === 0) return 'normal';
  const improving = direction === 'higher-is-better' ? delta > 0 : delta < 0;
  if (improving) return 'normal';
  return 'warning';
}

/** « +1 240 » / « −3 » — le signe est explicite, y compris au positif. */
export function formatDelta(delta: number, format: (value: number) => string): string {
  if (delta === 0) return '=';
  // U+2212 (signe moins typographique) et non le trait d'union : il s'aligne
  // avec les chiffres tabulaires.
  return delta > 0 ? `+${format(delta)}` : `−${format(Math.abs(delta))}`;
}
