import { Panel, PanelHeader } from '@/components/ui/panel';
import { Sparkline } from '@/components/ui/sparkline';

/**
 * Taux de résolution — nombre d'interventions clôturées sur la période.
 *
 * Volontairement minimal : un chiffre, sa tendance, une courbe. C'est un
 * indicateur de suivi, pas un tableau d'analyse.
 */
export function ResolutionRate({
  resolved,
  trendLabel,
  series,
}: {
  resolved: number;
  trendLabel: string;
  series: number[];
}) {
  return (
    <Panel>
      <PanelHeader title="Taux de résolution" />
      <div className="flex items-end justify-between gap-3 px-3.5 pb-3.5">
        <div className="min-w-0">
          <p className="tnum text-[1.375rem] leading-none font-bold text-ink">{resolved}</p>
          <p className="mt-1 text-[0.625rem] text-ink-dim">interventions terminées</p>
          <p className="mt-1 text-[0.625rem] font-medium text-accent-green">{trendLabel}</p>
        </div>
        <div className="h-[42px] w-[112px] shrink-0 text-accent-green">
          <Sparkline values={series} filled strokeWidth={1.5} />
        </div>
      </div>
    </Panel>
  );
}
