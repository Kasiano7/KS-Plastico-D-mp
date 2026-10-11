import { Panel, PanelHeader, PanelLink, PeriodLabel } from '@/components/ui/panel';
import { Sparkline } from '@/components/ui/sparkline';
import { SEVERITY_TEXT, TONE_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import { deltaSeverity } from '@/lib/kpi';
import type { KeyKpi } from '@/types/dashboard';

/**
 * Les quatre indicateurs que la direction regarde en premier.
 *
 * La variation est colorée selon son SENS métier, jamais selon son signe :
 * une baisse du taux de rebut est une bonne nouvelle.
 */
export function KpiSummary({ kpis, periodLabel }: { kpis: KeyKpi[]; periodLabel: string }) {
  return (
    <Panel className="justify-between">
      <div className="flex min-h-0 flex-1 flex-col">
        <PanelHeader title="KPI Clés" action={<PeriodLabel label={periodLabel} />} />

        <ul className="flex flex-1 flex-col justify-between gap-1.5 px-3.5 pb-1">
          {kpis.map((kpi) => (
            <li key={kpi.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[0.5625rem] font-semibold tracking-[0.1em] text-ink-dim uppercase">
                  {kpi.label}
                </p>
                <p className="tnum mt-0.5 text-[0.9375rem] leading-none font-bold text-ink">
                  {kpi.value}
                </p>
                <p
                  className={cn(
                    'tnum mt-1 truncate text-[0.5625rem]',
                    SEVERITY_TEXT[deltaSeverity(kpi.deltaMeaning)],
                  )}
                >
                  {kpi.delta}{' '}
                  <span className="text-ink-dim">{kpi.deltaCaption}</span>
                </p>
              </div>

              <div className={cn('h-[26px] w-[74px] shrink-0', TONE_TEXT[kpi.tone])}>
                <Sparkline values={kpi.series} strokeWidth={1.5} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <PanelLink href="/rapports">Voir tous les KPI &amp; rapports</PanelLink>
    </Panel>
  );
}
