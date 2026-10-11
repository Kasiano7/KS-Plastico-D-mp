import type { LucideIcon } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import { DemoDataBadge } from './demo-data-notice';
import { Sparkline } from '@/components/ui/sparkline';
import { TONE_SURFACE, TONE_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { MaintenanceKpi } from '@/types/maintenance';

/**
 * Carte KPI de la GMAO.
 *
 * La valeur reste en blanc : la teinte identifie le domaine (pastille, courbe),
 * elle ne qualifie pas le chiffre. Si tout était coloré, plus rien ne
 * ressortirait — et un tableau de bord de maintenance doit se lire d'un coup
 * d'œil, pas se déchiffrer.
 */
export function MaintenanceKpiCard({
  kpi,
  icon: Icon,
}: {
  kpi: MaintenanceKpi;
  icon: LucideIcon;
}) {
  return (
    <Panel className="justify-between overflow-hidden px-3 pt-2.5 pb-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn('grid size-[22px] shrink-0 place-items-center rounded-md', TONE_SURFACE[kpi.tone])}
        >
          <Icon className="size-3" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.625rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
          {kpi.label}
        </span>
        {/* Le marqueur est au plus près du chiffre : c'est lui qu'on lit, pas
            le bandeau en haut de page. */}
        <DemoDataBadge />
      </div>

      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="tnum text-[1.375rem] leading-none font-bold whitespace-nowrap text-ink">
            {kpi.value}
          </p>
          <p className={cn('mt-1 truncate text-[0.625rem] font-medium', TONE_TEXT[kpi.tone])}>
            {kpi.caption}
          </p>
          {kpi.target ? (
            <p className="mt-0.5 truncate text-[0.625rem] text-ink-dim">{kpi.target}</p>
          ) : null}
        </div>

        <div className={cn('h-[36px] w-[68px] shrink-0', TONE_TEXT[kpi.tone])}>
          <Sparkline values={kpi.series} filled strokeWidth={1.5} />
        </div>
      </div>
    </Panel>
  );
}
