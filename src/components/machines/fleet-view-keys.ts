import type { LucideIcon } from 'lucide-react';
import { LayoutGrid, List, Network, TrendingUp } from 'lucide-react';

/**
 * Vues et filtres du parc — partagés entre la page (serveur) et la barre
 * d'outils (client). Le fichier ne porte pas `'use client'` : ces valeurs
 * doivent rester lisibles des deux côtés.
 */
export const FLEET_VIEWS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'ensemble', label: 'Vue d’ensemble', icon: LayoutGrid },
  { key: 'liste', label: 'Liste', icon: List },
  { key: 'analyse', label: 'Analyse', icon: TrendingUp },
  { key: 'connexions', label: 'Connexions', icon: Network },
];

export type FleetViewKey = 'ensemble' | 'liste' | 'analyse' | 'connexions';

export function isFleetView(value: string | undefined): value is FleetViewKey {
  return value === 'ensemble' || value === 'liste' || value === 'analyse' || value === 'connexions';
}

export const FLEET_STATES = [
  { value: 'all', label: 'Tous les états' },
  { value: 'production', label: 'En production' },
  { value: 'stopped', label: 'Arrêtée' },
  { value: 'fault', label: 'Défaut' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'setup', label: 'Réglage' },
  { value: 'mold_change', label: 'Changement de moule' },
  { value: 'idle', label: 'Disponible' },
] as const;
