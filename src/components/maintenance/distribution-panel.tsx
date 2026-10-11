import { DonutChart } from '@/components/charts/donut-chart';
import { Panel, PanelHeader, PanelLink } from '@/components/ui/panel';
import { TONE_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { DistributionSlice } from '@/types/maintenance';

/**
 * Anneau de répartition + légende — forme partagée par les deux analyses de la
 * page (demandes par type d'actif, causes d'incident).
 *
 * Factorisé volontairement : deux anneaux identiques dessinés deux fois
 * finiraient par diverger au premier ajustement.
 */
export function DistributionPanel({
  title,
  slices,
  total,
  totalLabel,
  action,
  linkHref,
  linkLabel,
  size = 108,
}: {
  title: string;
  slices: DistributionSlice[];
  total: number;
  totalLabel: string;
  action?: React.ReactNode;
  linkHref?: string;
  linkLabel?: string;
  size?: number;
}) {
  return (
    <Panel>
      <PanelHeader title={title} action={action} />

      <div className="min-h-0 flex-1 px-3.5 pb-2">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <DonutChart
              slices={slices.map((slice) => ({
                id: slice.id,
                label: slice.label,
                sharePct: slice.sharePct,
                tone: slice.tone,
              }))}
              size={size}
              thickness={17}
            />
            {/* Le total au centre : l'anneau montre la part, le centre donne la masse. */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <span>
                <span className="tnum block text-[1.0625rem] leading-none font-bold text-ink">
                  {total}
                </span>
                <span className="mt-0.5 block text-[0.5625rem] text-ink-dim">{totalLabel}</span>
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-[5px]">
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-center gap-1.5 text-[0.625rem]">
                <span
                  aria-hidden
                  className={cn('size-[7px] shrink-0 rounded-full bg-current', TONE_TEXT[slice.tone])}
                />
                <span className="min-w-0 flex-1 truncate text-ink-muted">{slice.label}</span>
                <span className="tnum shrink-0 font-medium text-ink">{slice.sharePct} %</span>
                <span className="tnum w-6 shrink-0 text-right text-ink-dim">({slice.count})</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {linkHref && linkLabel ? (
        <PanelLink href={linkHref} align="end">
          {linkLabel}
        </PanelLink>
      ) : (
        <div className="pb-2" />
      )}
    </Panel>
  );
}
