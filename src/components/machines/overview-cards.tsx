import type { ReactNode } from 'react';
import Link from 'next/link';
import { Droplets, Info, Wind, Zap } from 'lucide-react';
import type { MachineOverview } from '@/server/services/machine-overview';
import { DataOrigin } from '@/components/ui/primitives';
import { SEVERITY_TEXT, type Severity } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDate, formatDecimal, formatDuration, formatNumber, formatTime } from '@/lib/format';
import { SignalBar } from './gauges';
import { ProductionHourlyChart, RatioDonut } from './overview-charts';
import styles from './machines.module.css';

/** Carte du module : même fond, même filet, même rayon partout. */
export function Panel({
  title,
  hint,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn(styles.panel, 'rounded-2xl border border-line', className)}>
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] leading-6 font-semibold text-fg">{title}</h2>
          {hint ? <p className="mt-0.5 text-[0.8125rem] text-fg-muted">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn('px-5 pb-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ─────────────────────────────────────────────────── Production 24 h ──── */

export function ProductionCard({ machine }: { machine: MachineOverview }) {
  const { production } = machine;

  const tiles = [
    { label: 'Pièces bonnes', value: formatNumber(production.goodUnits), className: 'text-normal' },
    {
      label: 'Pièces rebutées',
      value: `${formatNumber(production.rejectedUnits)}`,
      suffix: `(${formatDecimal(production.rejectRatePct)}%)`,
      className: 'text-critical',
    },
    { label: 'Objectif', value: formatNumber(production.targetUnits), className: 'text-fg' },
    { label: 'Avancement', value: `${production.achievementPct}%`, className: 'text-fg' },
  ];

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          Production <span className="text-[0.9375rem] font-normal text-fg-muted">(24h)</span>
          <span title="Répartition horaire au prorata du temps réellement passé en production.">
            <Info className="size-3.5 text-fg-subtle" aria-hidden />
          </span>
        </span>
      }
      action={
        <span className="inline-flex h-8 items-center rounded-lg border border-line bg-surface-sunken px-3 text-[0.8125rem] text-fg-muted">
          24 dernières heures
        </span>
      }
    >
      <ul className="mb-2 flex flex-wrap items-center gap-4 text-[0.8125rem]" aria-hidden>
        <li className="flex items-center gap-1.5 text-fg-muted">
          <span className="size-2.5 rounded-full bg-normal" /> Bonnes
        </li>
        <li className="flex items-center gap-1.5 text-fg-muted">
          <span className="size-2.5 rounded-full bg-critical" /> Rebutées
        </li>
        <li className="flex items-center gap-1.5 text-fg-muted">
          <span className="h-px w-4 border-t border-dashed border-current" /> Objectif total
        </li>
        <li className="flex items-center gap-1.5 text-brand">
          <span className="h-px w-4 border-t border-dashed border-current" /> Capacité max/h
        </li>
      </ul>

      <ProductionHourlyChart points={production.hourly} />

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border border-line bg-surface-sunken px-3 py-3 text-center">
            <p className="text-[0.75rem] text-fg-muted">{tile.label}</p>
            <p className={cn('tabular mt-1.5 text-[1.25rem] leading-none font-semibold', tile.className)}>
              {tile.value}
              {tile.suffix ? <span className="ml-1 text-[0.8125rem]">{tile.suffix}</span> : null}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ──────────────────────────────────────────────── État de la machine ──── */

export function MachineStateCard({ machine }: { machine: MachineOverview }) {
  return (
    <Panel
      title="État de la machine"
      action={<DataOrigin origin={machine.signalsMeasured ? 'measured' : 'estimated'} />}
    >
      <dl className="space-y-3">
        {machine.signalRows.map((row) => (
          <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_7rem_5rem] items-center gap-3">
            <dt className="truncate text-[0.8125rem] text-fg-muted">{row.label}</dt>
            <SignalBar fillPct={row.fillPct} tone={row.tone} />
            <dd
              className={cn(
                'tabular text-right text-[0.8125rem] font-semibold',
                row.tone === 'normal' && row.key === 'oil-level' ? 'text-normal' : 'text-fg',
                row.tone === 'critical' && 'text-critical',
                row.tone === 'warning' && 'text-warning',
              )}
            >
              {row.display}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[0.6875rem] leading-5 text-fg-subtle">{machine.signalsProviderLabel}</p>
    </Panel>
  );
}

/* ───────────────────────────────────────────────────── Consommations ──── */

/** Les moyennes de fluides se lisent au centième : 0,13 m³/h, pas 0,1. */
const preciseFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

export function ConsumptionCard({ machine }: { machine: MachineOverview }) {
  const { consumption } = machine.signals;

  const rows = [
    {
      key: 'electricity',
      icon: Zap,
      className: 'text-warning',
      label: 'Électricité',
      value: `${formatDecimal(consumption.electricityKwh)} kWh`,
      average: `${formatDecimal(consumption.electricityAverageKw)} kW moy.`,
    },
    {
      key: 'water',
      icon: Droplets,
      className: 'text-info',
      label: 'Eau',
      value: `${formatDecimal(consumption.waterCubicMeters)} m³`,
      average: `${preciseFormat.format(consumption.waterAverageCubicMetersPerHour)} m³/h moy.`,
    },
    {
      key: 'air',
      icon: Wind,
      className: 'text-brand',
      label: 'Air comprimé',
      value: `${formatDecimal(consumption.compressedAirNormalCubicMeters)} Nm³`,
      average: `${preciseFormat.format(consumption.compressedAirAverageNormalCubicMetersPerHour)} Nm³/h moy.`,
    },
  ];

  return (
    <Panel
      title={
        <span>
          Consommations <span className="text-[0.9375rem] font-normal text-fg-muted">(24h)</span>
        </span>
      }
      action={
        <div className="flex items-center gap-2">
          <DataOrigin origin={machine.signalsMeasured ? 'measured' : 'estimated'} />
          <span className="inline-flex h-8 items-center rounded-lg border border-line bg-surface-sunken px-3 text-[0.8125rem] text-fg-muted">
            24 dernières heures
          </span>
        </div>
      }
    >
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface-sunken px-3.5 py-3"
          >
            <row.icon className={cn('size-4 shrink-0', row.className)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[0.875rem] text-fg">{row.label}</span>
            <span className="tabular shrink-0 text-[0.9375rem] font-semibold text-fg">{row.value}</span>
            <span className="tabular w-28 shrink-0 text-right text-[0.75rem] text-fg-subtle">
              {row.average}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ─────────────────────────────────────────────────────── Températures ─── */

export function TemperatureCard({ machine }: { machine: MachineOverview }) {
  return (
    <Panel
      title={<span>Températures <span className="text-[0.9375rem] font-normal text-fg-muted">(°C)</span></span>}
      action={<DataOrigin origin={machine.signalsMeasured ? 'measured' : 'estimated'} />}
    >
      <dl className="space-y-3">
        {machine.signals.zones.map((zone) => (
          <div key={zone.key} className="grid grid-cols-[7rem_4rem_minmax(0,1fr)] items-center gap-3">
            <dt className="truncate text-[0.8125rem] text-fg-muted">{zone.label}</dt>
            <dd className="tabular text-[0.8125rem] font-semibold text-fg">{zone.celsius} °C</dd>
            <SignalBar
              fillPct={(zone.celsius / zone.maxCelsius) * 100}
              tone={zone.key === 'mold-return' ? 'info' : zone.tone === 'normal' ? 'warning' : zone.tone}
            />
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ───────────────────────────────────────────────────── Disponibilités ─── */

export function AvailabilityCard({ machine }: { machine: MachineOverview }) {
  const { availability } = machine;

  const segments = [
    {
      key: 'production',
      label: 'Production',
      value: availability.productiveMinutes,
      className: 'text-normal',
      pct: availability.productivePct,
    },
    {
      key: 'planned',
      label: 'Arrêts planifiés',
      value: availability.plannedStopMinutes,
      className: 'text-info',
      pct: availability.plannedStopPct,
    },
    {
      key: 'unplanned',
      label: 'Arrêts non planifiés',
      value: availability.unplannedStopMinutes,
      className: 'text-critical',
      pct: availability.unplannedStopPct,
    },
  ];

  return (
    <Panel title="Disponibilités" action={<DataOrigin origin="computed" />}>
      <div className="flex flex-wrap items-center gap-5">
        <RatioDonut
          segments={segments}
          centerValue={formatDuration(availability.totalMinutes)}
          centerLabel="Total"
          ariaLabel={`Répartition du temps de ${machine.name} sur la journée`}
        />
        <ul className="min-w-40 flex-1 space-y-3">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn('mt-1 size-2.5 shrink-0 rounded-full bg-current', segment.className)}
              />
              <span className="min-w-0">
                <span className="block text-[0.8125rem] text-fg-muted">{segment.label}</span>
                <span className="tabular block text-[0.8125rem] font-semibold text-fg">
                  {formatDuration(segment.value)}{' '}
                  <span className="font-normal text-fg-subtle">({Math.round(segment.pct)}%)</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────── Derniers arrêts ── */

export function RecentStopsCard({ machine }: { machine: MachineOverview }) {
  return (
    <Panel
      title="Derniers arrêts"
      action={
        <Link
          href={`/machines/${machine.id}/arrets`}
          prefetch={false}
          className="text-[0.8125rem] font-medium text-brand hover:underline"
        >
          Voir tout
        </Link>
      }
    >
      {machine.recentStops.length === 0 ? (
        <p className="text-[0.8125rem] text-fg-muted">
          Aucun arrêt enregistré sur les 24 dernières heures.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {machine.recentStops.map((stop) => (
            <li
              key={stop.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-sunken px-3.5 py-3"
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    'flex items-center gap-2 text-[0.875rem] font-medium',
                    SEVERITY_TEXT[stop.severity],
                  )}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
                  <span className="truncate">{stop.label}</span>
                </p>
                <p className="mt-1 truncate pl-4 text-[0.75rem] text-fg-muted">
                  {stop.reason ?? (stop.planned ? 'Arrêt planifié' : 'Arrêt subi')}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[0.8125rem] font-medium text-fg">{formatTime(stop.startedAt)}</p>
                <p className="tabular mt-1 text-[0.75rem] text-fg-muted">
                  {formatDuration(stop.durationMinutes)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────────────────────────────────────── Informations machine ─── */

export function MachineInformationCard({ machine }: { machine: MachineOverview }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Numéro de série', value: machine.nameplate.serialNumber ?? '—' },
    {
      label: 'Année de fabrication',
      value: machine.nameplate.manufacturingYear ? String(machine.nameplate.manufacturingYear) : '—',
    },
    {
      label: 'Heures totales',
      value: machine.nameplate.totalHours ? `${formatNumber(machine.nameplate.totalHours)} h` : '—',
    },
    {
      label: 'Heures en production',
      value: machine.nameplate.productionHours
        ? `${formatNumber(machine.nameplate.productionHours)} h`
        : '—',
    },
    { label: 'Logiciel de contrôle', value: machine.nameplate.controlSoftware ?? '—' },
    { label: 'Version', value: machine.nameplate.controlSoftwareVersion ?? '—' },
  ];

  return (
    <Panel title="Informations machine">
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-[0.8125rem] text-fg-muted">{row.label}</dt>
            <dd className="tabular truncate text-right text-[0.8125rem] font-medium text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/* ────────────────────────────────────────────────────────── Maintenance ── */

export function MaintenanceCard({ machine }: { machine: MachineOverview }) {
  const next = machine.nextMaintenance;
  const severity: Severity = !next ? 'info' : next.daysAhead <= 7 ? 'warning' : 'normal';

  return (
    <Panel title="Maintenance">
      {next ? (
        <>
          <p className="text-[0.8125rem] text-fg-muted">Prochaine intervention planifiée</p>
          <p className="mt-2 text-[0.9375rem] font-medium text-fg">{next.title}</p>
          <p className={cn('tabular mt-3 text-[1.375rem] leading-none font-semibold', SEVERITY_TEXT[severity])}>
            Dans {next.daysAhead} jour{next.daysAhead > 1 ? 's' : ''}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-fg-muted">{formatDate(next.scheduledAt)}</p>
          {next.remainingHours !== null ? (
            <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <span className="text-[0.8125rem] text-fg-muted">Heures d’ouverture restantes</span>
              <span className="tabular text-[0.8125rem] font-semibold text-fg">
                {formatNumber(next.remainingHours)} h
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-[0.8125rem] leading-6 text-fg-muted">
          Aucune intervention préventive planifiée sur cette presse.
        </p>
      )}

      <Link
        href={`/machines/${machine.id}/maintenance`}
        prefetch={false}
        className="mt-4 flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface text-[0.8125rem] font-medium text-fg transition-colors hover:bg-surface-raised"
      >
        Voir le plan de maintenance
      </Link>
    </Panel>
  );
}
