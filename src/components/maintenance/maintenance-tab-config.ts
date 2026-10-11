/**
 * Définition des onglets de la maintenance.
 *
 * Volontairement dans un module neutre — ni `'use client'`, ni `server-only` :
 * la page (serveur) doit résoudre l'onglet actif, la barre d'onglets (client)
 * doit le mettre en surbrillance. Les deux lisent donc la même liste.
 */
export const MAINTENANCE_TABS = [
  { id: 'vue-ensemble', label: 'Vue d’ensemble' },
  { id: 'calendrier', label: 'Calendrier' },
  { id: 'historique', label: 'Historique des interventions' },
  { id: 'preventif', label: 'Préventif' },
  { id: 'curatif', label: 'Curatif' },
  { id: 'interventions', label: 'Interventions' },
  { id: 'utilites', label: 'Utilités' },
  { id: 'pieces', label: 'Pièces & stocks' },
  { id: 'documents', label: 'Documents' },
] as const;

export type MaintenanceTabId = (typeof MAINTENANCE_TABS)[number]['id'];

export const DEFAULT_MAINTENANCE_TAB: MaintenanceTabId = 'vue-ensemble';

/** Normalise la valeur d'URL : une valeur inconnue retombe sur la vue d'ensemble. */
export function resolveMaintenanceTab(value: string | undefined): MaintenanceTabId {
  const match = MAINTENANCE_TABS.find((tab) => tab.id === value);
  return match ? match.id : DEFAULT_MAINTENANCE_TAB;
}
