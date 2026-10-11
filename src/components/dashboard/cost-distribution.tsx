import { DonutChart, DonutLegend } from '@/components/charts/donut-chart';
import { Panel, PanelHeader, PanelLink, PeriodLabel } from '@/components/ui/panel';
import { formatCompactCents } from '@/lib/format';
import type { CostBreakdown } from '@/types/dashboard';

/** Structure de coût du mois : le total, puis ce qui le compose. */
export function CostDistribution({ costs }: { costs: CostBreakdown }) {
  const slices = costs.slices.map((slice) => ({
    ...slice,
    valueLabel: formatCompactCents(slice.amountCents),
  }));

  return (
    <Panel className="justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader
          title="Répartition des coûts"
          action={<PeriodLabel label={costs.periodLabel} />}
        />

        <div className="px-3.5">
          <p className="tnum text-[1.25rem] leading-none font-bold text-ink">
            {formatCompactCents(costs.totalCents)}
          </p>
          <p className="mt-1 text-[0.625rem] text-ink-dim">Coût total</p>
        </div>

        <div className="mt-1.5 flex flex-1 items-center gap-3 px-3.5">
          <DonutChart slices={slices} size={84} thickness={14} />
          <DonutLegend slices={slices} className="min-w-0 flex-1 space-y-[7px]" />
        </div>
      </div>

      <PanelLink href="/rapports">Voir le détail</PanelLink>
    </Panel>
  );
}
