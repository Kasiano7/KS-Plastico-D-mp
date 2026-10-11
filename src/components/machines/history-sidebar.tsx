import Link from 'next/link';
import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import type { MachineHistory } from '@/server/services/machine-history';
import { formatEventDuration } from '@/server/domain/machine-events';
import { cn } from '@/lib/cn';
import { TrendLine } from './gauges';
import { RatioDonut } from './overview-charts';
import { Panel } from './overview-cards';

/** Bornes de la période, au format court des maquettes (« 18/05/2024 »). */
const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

const dayMonth = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Paris',
});

const SEVERITY_CLASS = {
  critical: 'text-critical',
  major: 'text-warning',
  minor: 'text-info',
  info: 'text-fg-subtle',
} as const;

/** Répartition des événements de la période, par sévérité. */
export function HistorySummary({ history }: { history: MachineHistory }) {
  const total = history.periodEvents.length;

  const segments = history.breakdown.map((row) => ({
    key: row.severity,
    label: row.label,
    value: row.count,
    className: SEVERITY_CLASS[row.severity],
  }));

  return (
    <Panel
      title="Résumé sur la période"
      hint={`${shortDate.format(history.from)} → ${shortDate.format(history.to)}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <RatioDonut
          segments={segments}
          centerValue={String(total)}
          centerLabel="événements"
          size={132}
          thickness={20}
          ariaLabel="Répartition des événements par sévérité"
        />
        <ul className="min-w-36 flex-1 space-y-2.5">
          {history.breakdown.map((row) => (
            <li key={row.severity} className="flex items-center gap-2 text-[0.8125rem]">
              <span
                aria-hidden
                className={cn('size-2.5 shrink-0 rounded-full bg-current', SEVERITY_CLASS[row.severity])}
              />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{row.label}s</span>
              <span className="tabular shrink-0 font-semibold text-fg">{row.count}</span>
              <span className="tabular w-12 shrink-0 text-right text-fg-subtle">({row.sharePct}%)</span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/** Temps d'arrêt cumulé et sa variation face à la période précédente. */
export function DowntimeSummary({ history }: { history: MachineHistory }) {
  const variation = history.downtimeVariationPct;
  const worse = variation !== null && variation > 0;
  const VariationIcon = worse ? TrendingUp : TrendingDown;

  return (
    <Panel title="Temps d’arrêt total">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="tabular text-[1.75rem] leading-none font-semibold text-critical">
          {formatEventDuration(history.downtimeSeconds)}
        </p>
        {variation !== null ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[0.75rem] font-medium',
              worse ? 'border-critical/40 bg-critical-soft text-critical' : 'border-normal/40 bg-normal-soft text-normal',
            )}
          >
            <VariationIcon className="size-3.5" aria-hidden />
            {variation > 0 ? '+' : ''}
            {variation}%
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[0.8125rem] text-fg-muted">
        vs période précédente ({shortDate.format(history.previousFrom)} → {shortDate.format(history.from)})
      </p>

      <div className="mt-4 h-[5.5rem]">
        <TrendLine
          values={history.downtimeTrend.map((point) => point.seconds)}
          ariaLabel="Évolution du temps d’arrêt quotidien"
        />
      </div>
      <div className="mt-1 flex justify-between text-[0.6875rem] text-fg-subtle" aria-hidden>
        {history.downtimeTrend
          .filter((_, index) => index % Math.max(Math.ceil(history.downtimeTrend.length / 4), 1) === 0)
          .map((point) => (
            <span key={point.date.toISOString()}>{dayMonth.format(point.date)}</span>
          ))}
        <span>{dayMonth.format(history.downtimeTrend[history.downtimeTrend.length - 1]?.date ?? history.to)}</span>
      </div>
    </Panel>
  );
}

/** Les cinq codes d'alarme les plus fréquents de la période. */
export function TopAlarms({ history, machineId }: { history: MachineHistory; machineId: string }) {
  return (
    <Panel title="Top 5 des alarmes">
      {history.topAlarms.length === 0 ? (
        <p className="text-[0.8125rem] text-fg-muted">Aucune alarme sur la période.</p>
      ) : (
        <ul className="space-y-2.5">
          {history.topAlarms.map((alarm) => (
            <li key={alarm.code} className="grid grid-cols-[4.5rem_minmax(0,1fr)_2rem] items-baseline gap-2">
              <span className="tabular text-[0.8125rem] font-medium text-critical">{alarm.code}</span>
              <span className="truncate text-[0.8125rem] text-fg-muted">{alarm.title}</span>
              <span className="tabular text-right text-[0.8125rem] font-semibold text-fg">{alarm.count}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={`/machines/${machineId}/arrets`}
        prefetch={false}
        className="mt-4 flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-line text-[0.8125rem] font-medium text-brand transition-colors hover:border-brand/40 hover:bg-brand-soft"
      >
        Voir toutes les statistiques
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </Panel>
  );
}
