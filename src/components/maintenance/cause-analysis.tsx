import { DistributionPanel } from './distribution-panel';
import type { DistributionSlice } from '@/types/maintenance';

/**
 * Analyse des causes.
 *
 * Répond à « pourquoi tombe-t-on en panne ? » plutôt qu'à « combien de
 * pannes ? ». C'est la vue qui oriente le plan de maintenance préventive.
 */
export function CauseAnalysis({
  slices,
  total,
}: {
  slices: DistributionSlice[];
  total: number;
}) {
  return (
    <DistributionPanel
      title="Analyse des causes"
      slices={slices}
      total={total}
      totalLabel="incidents"
      size={96}
      linkHref="/maintenance?onglet=historique"
      linkLabel="Voir l’analyse détaillée"
    />
  );
}
