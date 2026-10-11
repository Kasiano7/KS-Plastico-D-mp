import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { Panel, PanelHeader } from '@/components/ui/panel';
import type { WorkshopShare } from '@/types/dashboard';

/** Part de la production du jour par atelier. */
export function WorkshopDistribution({ workshops }: { workshops: WorkshopShare[] }) {
  return (
    <Panel>
      <PanelHeader title="Répartition par atelier" />

      <div className="flex flex-1 items-center gap-3 px-3.5 pb-3">
        <DonutChart slices={workshops} size={92} thickness={15} />
        <DonutLegend slices={workshops} className="min-w-0 flex-1 space-y-[7px]" />
      </div>
    </Panel>
  );
}
