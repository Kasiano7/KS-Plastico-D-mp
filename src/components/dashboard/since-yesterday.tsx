import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Panel } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { formatCompactCents, formatDuration, formatNumber } from '@/lib/format';
import {
  compareToPreviousDay,
  formatDelta,
  type DeltaDirection,
} from '@/server/domain/day-over-day';
import type { OperationalMetrics } from '@/server/services/daily-snapshot';

/**
 * Bande « Depuis hier ».
 *
 * Un directeur d'usine pose trois questions : vais-je livrer, qu'est-ce qui me
 * bloque, et ça va mieux ou moins bien qu'hier ? L'accueil répondait aux deux
 * premières. Cette bande répond à la troisième, et se lit en trois secondes.
 *
 * Quand la veille n'a pas été enregistrée, la valeur du jour reste affichée et
 * l'écart annonce « pas de référence » — jamais un zéro qui se lirait
 * « stable » alors qu'on ne sait rien (règle n° 4).
 */

type Metric = {
  id: keyof OperationalMetrics;
  label: string;
  direction: DeltaDirection;
  format: (value: number) => string;
};

const METRICS: Metric[] = [
  { id: 'producedUnits', label: 'Production', direction: 'higher-is-better', format: formatNumber },
  { id: 'lateOrders', label: 'Commandes en retard', direction: 'lower-is-better', format: formatNumber },
  { id: 'downtimeMinutes', label: 'Arrêts machines', direction: 'lower-is-better', format: formatDuration },
  { id: 'downtimeCostCents', label: 'Coût des arrêts', direction: 'lower-is-better', format: formatCompactCents },
];

const TONE = {
  normal: { text: 'text-accent-green', icon: ArrowUpRight },
  warning: { text: 'text-accent-orange', icon: ArrowDownRight },
  info: { text: 'text-ink-dim', icon: ArrowRight },
  critical: { text: 'text-danger', icon: ArrowDownRight },
} as const;

export function SinceYesterday({
  today,
  yesterday,
}: {
  today: OperationalMetrics;
  yesterday: OperationalMetrics | null;
}) {
  return (
    <Panel className="px-3.5 py-3">
      <h2 className="text-[0.5625rem] font-semibold tracking-[0.12em] text-ink-dim uppercase">
        Depuis hier
      </h2>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
        {METRICS.map((metric) => {
          const value = today[metric.id];
          const comparison = compareToPreviousDay(
            value,
            yesterday?.[metric.id] ?? null,
            metric.direction,
          );
          const tone = TONE[comparison.severity];
          /*
           * Une flèche n'indique pas le sens du chiffre mais celui de la
           * situation : moins de retards, c'est une flèche montante verte —
           * l'inverse serait illisible pour qui lit vite.
           */
          const Icon = comparison.delta === 0 ? ArrowRight : tone.icon;

          return (
            <div key={metric.id} className="min-w-0">
              <dt className="truncate text-[0.625rem] text-ink-dim">{metric.label}</dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <span className="tnum text-[1.0625rem] leading-none font-semibold text-ink">
                  {metric.format(value)}
                </span>

                {comparison.delta === null ? (
                  <span className="text-[0.625rem] text-ink-dim">pas de référence</span>
                ) : (
                  <span className={cn('inline-flex items-center gap-0.5 text-[0.625rem]', tone.text)}>
                    <Icon aria-hidden className="size-3" strokeWidth={2.5} />
                    <span className="tnum">{formatDelta(comparison.delta, metric.format)}</span>
                    {comparison.deltaPct !== null ? (
                      <span className="tnum opacity-70">
                        ({formatDelta(comparison.deltaPct, (n) => `${n} %`)})
                      </span>
                    ) : null}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {yesterday === null ? (
        <p className="mt-2.5 border-t border-edge-soft pt-2 text-[0.625rem] leading-relaxed text-ink-dim">
          Aucun instantané de la veille n’est encore enregistré. La comparaison apparaîtra dès le
          deuxième jour d’utilisation.
        </p>
      ) : null}
    </Panel>
  );
}
