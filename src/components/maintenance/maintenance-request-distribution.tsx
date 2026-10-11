import { DemoDataBadge } from './demo-data-notice';
import { DistributionPanel } from './distribution-panel';
import type { DistributionSlice } from '@/types/maintenance';

/** Répartition des demandes par type d'actif — sur les 30 derniers jours. */
export function MaintenanceRequestDistribution({
  slices,
  total,
}: {
  slices: DistributionSlice[];
  total: number;
}) {
  return (
    <DistributionPanel
      title="Répartition des demandes par type d’actif"
      slices={slices}
      total={total}
      totalLabel="demandes"
      action={
        <span className="flex items-center gap-1.5">
          <span className="rounded-chip border border-edge px-1.5 py-[3px] text-[0.625rem] font-medium whitespace-nowrap text-ink-muted">
            30 derniers jours
          </span>
          <DemoDataBadge />
        </span>
      }
    />
  );
}
