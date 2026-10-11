import type { Severity } from '@/components/ui/severity';

/**
 * Sélection de ce qui demande une attention immédiate.
 *
 * Les pages de listes affichent tout au même poids : l'œil doit lire vingt
 * lignes pour trouver les deux qui posent problème, alors que la sévérité de
 * chacune est déjà calculée par le domaine. Cette fonction ne calcule rien de
 * neuf — elle choisit, ordonne et tronque.
 *
 * Règle : on ne remonte que `critical` et `warning`. Faire remonter `info`
 * remplirait la bande en permanence, et une bande toujours pleine ne signale
 * plus rien.
 */

export type AttentionItem = {
  id: string;
  severity: Severity;
  /** Ce qui ne va pas, en une ligne. */
  title: string;
  /** Le chiffre ou le fait qui le prouve. */
  detail?: string;
  /** Où aller pour traiter. */
  href?: string;
};

/** Seules ces deux sévérités interrompent la lecture. */
const RANK: Partial<Record<Severity, number>> = { critical: 0, warning: 1 };

export const ATTENTION_LIMIT = 3;

export function selectAttention(
  items: readonly AttentionItem[],
  limit: number = ATTENTION_LIMIT,
): AttentionItem[] {
  return items
    .filter((item) => RANK[item.severity] !== undefined)
    .slice()
    /*
     * Tri stable : à sévérité égale, l'ordre d'entrée est conservé. Les pages
     * fournissent déjà leurs lignes triées par gravité métier (couverture de
     * stock croissante, retard décroissant…) — ce tri-ci ne fait que hisser
     * le critique au-dessus de l'attention, sans défaire ce classement.
     */
    .sort((a, b) => (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9))
    .slice(0, Math.max(limit, 0));
}

/**
 * Y a-t-il quelque chose à signaler ?
 * Séparé de la sélection pour que l'appelant puisse ne rien rendre du tout
 * plutôt qu'une bande vide — « rien à signaler » se dit une fois, pas sur
 * chaque page.
 */
export function hasAttention(items: readonly AttentionItem[]): boolean {
  return items.some((item) => RANK[item.severity] !== undefined);
}
