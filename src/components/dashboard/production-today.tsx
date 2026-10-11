import { ProductionChart } from '@/components/charts/production-chart';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SEVERITY_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { completionSeverity } from '@/lib/kpi';
import type { ProductionToday as ProductionTodayData } from '@/types/dashboard';

/** Production cumulée du jour : le chiffre, puis la trajectoire qui l'explique. */
export function ProductionToday({ data }: { data: ProductionTodayData }) {
  const severity = completionSeverity(data.completionPct);

  return (
    <Panel>
      <PanelHeader
        title="Production aujourd’hui"
        action={
          <span className={cn('tnum text-[0.875rem] font-bold', SEVERITY_TEXT[severity])}>
            {data.completionPct} %
          </span>
        }
      />

      <div className="px-3.5">
        <p className="tnum text-[1.125rem] leading-none font-bold text-ink">
          {formatNumber(data.produced)}
          <span className="ml-1 text-[0.6875rem] font-normal text-ink-dim">
            / {formatNumber(data.target)} unités
          </span>
        </p>
      </div>

      <div className="mt-1 h-[92px] min-h-0 flex-1 px-1.5">
        <ProductionChart points={data.points} />
      </div>

      <div className="flex items-center justify-center gap-4 px-3.5 pt-1 pb-2.5">
        <LegendItem label="Réalisé" className="text-accent-purple" />
        <LegendItem label="Objectif" className="text-ink-dim" dashed />
      </div>
    </Panel>
  );
}

function LegendItem({
  label,
  className,
  dashed = false,
}: {
  label: string;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[0.625rem] text-ink-muted">
      <span
        aria-hidden
        className={cn(
          'h-0 w-3.5 border-t-2 border-current',
          dashed ? 'border-dashed' : 'border-solid',
          className,
        )}
      />
      {label}
    </span>
  );
}
