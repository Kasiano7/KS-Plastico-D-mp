import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/server/domain/documents';

/**
 * Libellés et couleurs des catégories documentaires.
 *
 * Module neutre — ni `'use client'`, ni `'server-only'` : la bibliothèque
 * (client), la couverture (serveur) et le formulaire de dépôt de la fiche
 * machine lisent tous la même source. Deux listes qui divergent, c'est un
 * document rangé au mauvais endroit.
 */

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  notice_constructeur: 'Notice constructeur',
  plan_electrique: 'Plan électrique',
  fiche_reglage: 'Fiche de réglage',
  rapport_intervention: 'Rapport d’intervention',
  certificat_conformite: 'Certificat de conformité',
  autre: 'Autre',
};

/** Chaque catégorie garde la même couleur partout dans l'application. */
export const DOCUMENT_CATEGORY_STYLE: Record<DocumentCategory, string> = {
  notice_constructeur: 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
  plan_electrique: 'border-accent-purple/30 bg-accent-purple/10 text-accent-purple',
  fiche_reglage: 'border-accent-cyan/30 bg-accent-cyan/10 text-accent-cyan',
  rapport_intervention: 'border-accent-orange/30 bg-accent-orange/10 text-accent-orange',
  certificat_conformite: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
  autre: 'border-edge bg-background-secondary text-ink-muted',
};

/** Une catégorie retirée du référentiel s'affiche en « Autre », jamais en brut. */
export function documentCategoryOf(value: string): DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as DocumentCategory)
    : 'autre';
}
