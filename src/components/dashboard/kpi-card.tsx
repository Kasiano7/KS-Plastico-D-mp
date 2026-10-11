import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ICONS } from '@/components/ui/icon';
import { Panel } from '@/components/ui/panel';
import { Sparkline } from '@/components/ui/sparkline';
import { TONE_SURFACE, TONE_TEXT } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { KpiCard as KpiCardData } from '@/types/dashboard';

/**
 * Carte KPI principale.
 *
 * La valeur reste blanche : la teinte sert à identifier le domaine (pastille
 * d'icône, tendance), pas à qualifier le chiffre. Si tout était coloré, plus
 * rien ne ressortirait.
 */
export function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const Icon = ICONS[kpi.icon];

  return (
    <Link
      href={kpi.href}
      prefetch={false}
      aria-label={`Ouvrir la page ${kpi.label}`}
      className="group block rounded-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Panel className="h-full justify-between overflow-hidden px-3 pt-2.5 pb-0 transition-[transform,border-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/45 group-hover:shadow-lg group-focus-visible:border-primary/60">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-[22px] shrink-0 place-items-center rounded-md',
              TONE_SURFACE[kpi.tone],
            )}
          >
            <Icon className="size-3" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.625rem] font-semibold tracking-[0.12em] text-ink-muted uppercase">
            {kpi.label}
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="size-3 shrink-0 text-ink-dim transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            strokeWidth={2}
          />
        </div>

        <div className="mt-1.5">
          <p className="tnum text-[1.5rem] leading-none font-bold text-ink">{kpi.value}</p>
          <p className="mt-1 truncate text-[0.625rem] text-ink-dim">{kpi.caption}</p>
        </div>

        <div className={cn('-mx-3 mt-1 h-[34px]', TONE_TEXT[kpi.tone])}>
          <Sparkline values={kpi.series} filled strokeWidth={1.5} />
        </div>
      </Panel>
    </Link>
  );
}
