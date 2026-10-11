import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Radio, Server, WifiOff } from 'lucide-react';
import type { MachineCardModel, MachineFleet } from '@/server/services/machine-fleet';
import { oeeVerdict } from '@/server/domain/machines';
import { Card, DataOrigin, Progress, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { SEVERITY_CHIP, SEVERITY_TEXT, type Severity } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDecimal, formatNumber, formatSince } from '@/lib/format';
import { ActivityCurve } from './gauges';
import { MachineImage } from './machine-image';
import styles from './machines.module.css';

/** Carte d'ajout — dernière case de la grille, comme sur la maquette. */
export function AddMachineCard({ canCreate }: { canCreate: boolean }) {
  const content = (
    <>
      <span className="grid size-11 place-items-center rounded-full border border-brand/35 bg-brand-soft text-brand">
        <Plus className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-[0.9375rem] font-medium text-brand">Ajouter une machine</p>
      <p className="mt-1.5 max-w-[16rem] text-[0.8125rem] leading-5 text-fg-muted">
        {canCreate
          ? 'Connecter une nouvelle machine à votre parc.'
          : 'Seule l’administration peut raccorder une nouvelle machine.'}
      </p>
    </>
  );

  const className = cn(
    styles.addCard,
    'flex min-h-[26rem] flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong p-6 text-center transition-colors',
  );

  return canCreate ? (
    <Link href="/machines/nouvelle" prefetch={false} className={cn(className, 'hover:border-brand/45')}>
      {content}
    </Link>
  ) : (
    <div className={cn(className, 'opacity-75')} aria-disabled>
      {content}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── Liste ──── */

/**
 * Une presse sans production affiche 0 % : ce n'est pas un TRS critique, c'est
 * une absence de mesure. Le rouge reste réservé à un vrai problème (§6).
 */
function oeeTextClass(oeePct: number): string {
  return oeePct === 0 ? 'text-fg-subtle' : SEVERITY_TEXT[oeeVerdict(oeePct).severity];
}

/** Colonnes triables de la vue Liste — clé d'URL ↔ comparateur. */
export const FLEET_SORT_COLUMNS = ['name', 'workshop', 'oee', 'produced', 'energy'] as const;
export type FleetSortColumn = (typeof FLEET_SORT_COLUMNS)[number];
export type FleetSortDirection = 'asc' | 'desc';
export type FleetSort = { column: FleetSortColumn; direction: FleetSortDirection } | null;

function isFleetSortColumn(value: string | undefined): value is FleetSortColumn {
  return (FLEET_SORT_COLUMNS as readonly string[]).includes(value ?? '');
}

/** Lit le tri courant depuis les paramètres d'URL — `null` si absent ou invalide. */
export function parseFleetSort(column: string | undefined, direction: string | undefined): FleetSort {
  if (!isFleetSortColumn(column)) return null;
  return { column, direction: direction === 'desc' ? 'desc' : 'asc' };
}

/** Tri stable, appliqué uniquement à la vue Liste : les autres vues gardent l'ordre du parc. */
export function sortFleetMachines(machines: MachineCardModel[], sort: FleetSort): MachineCardModel[] {
  if (!sort) return machines;
  const compare: Record<FleetSortColumn, (a: MachineCardModel, b: MachineCardModel) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, 'fr'),
    workshop: (a, b) => a.workshopName.localeCompare(b.workshopName, 'fr'),
    oee: (a, b) => a.oeePct - b.oeePct,
    produced: (a, b) => a.producedUnits - b.producedUnits,
    energy: (a, b) => a.energyKwh - b.energyKwh,
  };
  const sorted = [...machines].sort(compare[sort.column]);
  return sort.direction === 'desc' ? sorted.reverse() : sorted;
}

const SORTABLE_HEADERS: { column: FleetSortColumn; label: string; align?: 'right' }[] = [
  { column: 'name', label: 'Machine' },
  { column: 'workshop', label: 'Atelier' },
  { column: 'oee', label: 'TRS', align: 'right' },
  { column: 'produced', label: 'Pièces', align: 'right' },
  { column: 'energy', label: 'Conso.', align: 'right' },
];

function SortableTh({
  column,
  label,
  align,
  sort,
  buildHref,
}: {
  column: FleetSortColumn;
  label: string;
  align?: 'right';
  sort: FleetSort;
  buildHref: (column: FleetSortColumn) => string;
}) {
  const active = sort?.column === column;
  const Icon = active ? (sort!.direction === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
  return (
    <Th className={align === 'right' ? 'text-right' : undefined}>
      <Link
        href={buildHref(column)}
        prefetch={false}
        className={cn(
          'inline-flex items-center gap-1 hover:text-fg',
          align === 'right' && 'flex-row-reverse',
          active && 'text-fg',
        )}
      >
        {label}
        <Icon className={cn('size-3', !active && 'opacity-40')} aria-hidden />
      </Link>
    </Th>
  );
}

export function FleetList({
  machines,
  sort,
  buildSortHref,
}: {
  machines: MachineCardModel[];
  sort: FleetSort;
  buildSortHref: (column: FleetSortColumn) => string;
}) {
  return (
    <Card className={cn(styles.panel, 'overflow-hidden border-line')}>
      <Table>
        <thead>
          <tr>
            {SORTABLE_HEADERS.map((header) => (
              <SortableTh key={header.column} sort={sort} buildHref={buildSortHref} {...header} />
            ))}
            <Th>État</Th>
            <Th>Depuis</Th>
            <Th numeric>Cycle</Th>
            <Th>Ordre en cours</Th>
          </tr>
        </thead>
        <tbody>
          {machines.map((machine) => (
            <Tr key={machine.id} className="hover:bg-surface-raised">
              <Td>
                <Link
                  href={`/machines/${machine.id}`}
                  prefetch={false}
                  className="flex items-center gap-3 hover:text-brand"
                >
                  <span className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-sunken">
                    <MachineImage
                      imageKey={machine.imageKey}
                      photoUrl={machine.photoUrl}
                      machineName={machine.name}
                      sizes="44px"
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{machine.name}</span>
                    <span className="block text-xs text-fg-subtle">
                      {machine.code} · {machine.manufacturer ?? '—'} {machine.model ?? ''}
                    </span>
                  </span>
                </Link>
              </Td>
              <Td className="text-fg-muted">{machine.workshopName}</Td>
              <Td className={cn('tabular text-right font-semibold', oeeTextClass(machine.oeePct))}>
                {Math.round(machine.oeePct)} %
              </Td>
              <Td numeric>{formatNumber(machine.producedUnits)}</Td>
              <Td numeric className="text-fg-muted">{formatDecimal(machine.energyKwh)} kWh</Td>
              <Td>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[0.6875rem] font-medium',
                    SEVERITY_CHIP[machine.severity],
                  )}
                >
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  {machine.statusLabel}
                </span>
              </Td>
              <Td className="tabular text-fg-muted">{formatSince(machine.statusSince)}</Td>
              <Td numeric className="text-fg-muted">
                {machine.cycleTimeSeconds ? `${formatDecimal(machine.cycleTimeSeconds)} s` : '—'}
              </Td>
              <Td>
                {machine.currentOrderNumber ? (
                  <>
                    <span className="block">{machine.currentProductName}</span>
                    <span className="block text-xs text-fg-subtle">{machine.currentOrderNumber}</span>
                  </>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────── Analyse ─── */

export function FleetAnalysis({ fleet, machines }: { fleet: MachineFleet; machines: MachineCardModel[] }) {
  const ranked = [...machines].sort((a, b) => b.oeePct - a.oeePct);
  const producing = machines.filter((machine) => machine.status === 'production');
  const averageOee =
    producing.length > 0
      ? producing.reduce((total, machine) => total + machine.oeePct, 0) / producing.length
      : 0;
  const producedUnits = machines.reduce((total, machine) => total + machine.producedUnits, 0);
  const rejectedUnits = machines.reduce((total, machine) => total + machine.rejectedUnits, 0);
  const energyKwh = machines.reduce((total, machine) => total + machine.energyKwh, 0);

  const tiles = [
    { label: 'TRS moyen des presses en production', value: `${formatDecimal(averageOee)} %`, origin: 'computed' as const },
    { label: 'Pièces bonnes produites aujourd’hui', value: formatNumber(producedUnits), origin: 'measured' as const },
    {
      label: 'Taux de rebut du parc',
      value:
        producedUnits + rejectedUnits > 0
          ? `${formatDecimal((rejectedUnits / (producedUnits + rejectedUnits)) * 100)} %`
          : '—',
      origin: 'computed' as const,
    },
    { label: 'Énergie consommée sur 24 h', value: `${formatDecimal(energyKwh)} kWh`, origin: 'estimated' as const },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className={cn(styles.panel, 'border-line p-4')}>
            <p className="text-[0.75rem] text-fg-muted">{tile.label}</p>
            <p className="tabular mt-2 text-[1.625rem] leading-none font-semibold text-fg">{tile.value}</p>
            <DataOrigin origin={tile.origin} className="mt-3" />
          </Card>
        ))}
      </div>

      <Card className={cn(styles.panel, 'border-line')}>
        <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-1">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-fg">Classement des presses par TRS</h2>
            <p className="mt-0.5 text-[0.8125rem] text-fg-muted">
              Calculé sur les 24 dernières heures à partir des événements machine réels.
            </p>
          </div>
          <DataOrigin origin="computed" />
        </header>
        <ul className="space-y-3 px-5 pt-4 pb-5">
          {ranked.map((machine) => (
            <li key={machine.id} className="grid grid-cols-[minmax(0,14rem)_1fr_4rem] items-center gap-4">
              <Link
                href={`/machines/${machine.id}`}
                prefetch={false}
                className="min-w-0 truncate text-[0.8125rem] text-fg hover:text-brand"
              >
                {machine.name}
                <span className="ml-2 text-xs text-fg-subtle">{machine.statusLabel}</span>
              </Link>
              <Progress
                value={machine.oeePct}
                severity={oeeVerdict(machine.oeePct).severity}
                label={`TRS de ${machine.name}`}
              />
              <span className={cn('tabular text-right text-[0.8125rem] font-semibold', oeeTextClass(machine.oeePct))}>
                {Math.round(machine.oeePct)} %
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className={cn(styles.panel, 'border-line')}>
        <header className="px-5 pt-5 pb-1">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Profil d’activité sur 24 h</h2>
          <p className="mt-0.5 text-[0.8125rem] text-fg-muted">
            Part de temps réellement passée en production, heure par heure.
          </p>
        </header>
        <div className="grid gap-4 px-5 pt-4 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => (
            <div key={machine.id} className="rounded-xl border border-line bg-surface-sunken p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[0.8125rem] text-fg">{machine.name}</span>
                <span className="tabular shrink-0 text-xs text-fg-subtle">{Math.round(machine.oeePct)} %</span>
              </div>
              <div className="h-12">
                <ActivityCurve
                  values={machine.activitySeries}
                  ariaLabel={`Activité de ${machine.name} sur 24 heures`}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="text-xs text-fg-subtle">
        Signaux process : {fleet.signalsProviderLabel}.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── Connexions ── */

const LINK_PRESENTATION = {
  gateway: { label: 'Passerelle industrielle', icon: Server, severity: 'normal' as Severity },
  simulated: { label: 'Télémétrie simulée', icon: Radio, severity: 'info' as Severity },
  offline: { label: 'Hors service', icon: WifiOff, severity: 'critical' as Severity },
};

export function FleetConnections({
  fleet,
  machines,
  gatewayReadings,
}: {
  fleet: MachineFleet;
  machines: MachineCardModel[];
  gatewayReadings: Map<string, Date>;
}) {
  return (
    <div className="space-y-4">
      <Card className={cn(styles.panel, 'border-line p-5')}>
        <h2 className="text-[0.9375rem] font-semibold text-fg">Chaîne de liaison</h2>
        <p className="mt-1 max-w-3xl text-[0.8125rem] leading-6 text-fg-muted">
          Le navigateur ne parle jamais à une presse. La chaîne est&nbsp;: presse → protocole
          industriel (OPC UA / EUROMAP 77) → passerelle locale sécurisée → API KS Plastico Demo → base de
          données → application. Tant qu’aucune passerelle n’est raccordée, les valeurs process
          affichées sont estimées, jamais mesurées.
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-sunken p-3">
            <dt className="text-xs text-fg-muted">Presses raccordées à la passerelle</dt>
            <dd className="tabular mt-1 text-[1.375rem] font-semibold text-fg">{fleet.gatewayCount}</dd>
          </div>
          <div className="rounded-xl border border-line bg-surface-sunken p-3">
            <dt className="text-xs text-fg-muted">Presses en télémétrie simulée</dt>
            <dd className="tabular mt-1 text-[1.375rem] font-semibold text-fg">{fleet.simulatedCount}</dd>
          </div>
          <div className="rounded-xl border border-line bg-surface-sunken p-3">
            <dt className="text-xs text-fg-muted">Presses hors service</dt>
            <dd className="tabular mt-1 text-[1.375rem] font-semibold text-fg">
              {fleet.totalCount - fleet.connectedCount}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className={cn(styles.panel, 'overflow-hidden border-line')}>
        <Table>
          <thead>
            <tr>
              <Th>Machine</Th>
              <Th>Constructeur / modèle</Th>
              <Th>Liaison</Th>
              <Th>Dernier relevé passerelle</Th>
              <Th>Source des signaux process</Th>
            </tr>
          </thead>
          <tbody>
            {machines.map((machine) => {
              const presentation = LINK_PRESENTATION[machine.link];
              const reading = gatewayReadings.get(machine.id);

              return (
                <Tr key={machine.id} className="hover:bg-surface-raised">
                  <Td>
                    <Link href={`/machines/${machine.id}`} prefetch={false} className="font-medium hover:text-brand">
                      {machine.name}
                    </Link>
                    <span className="ml-2 text-xs text-fg-subtle">{machine.code}</span>
                  </Td>
                  <Td className="text-fg-muted">
                    {machine.manufacturer ?? '—'} {machine.model ?? ''}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[0.6875rem] font-medium',
                        SEVERITY_CHIP[presentation.severity],
                      )}
                    >
                      <presentation.icon className="size-3.5" aria-hidden />
                      {presentation.label}
                    </span>
                  </Td>
                  <Td className="tabular text-fg-muted">
                    {reading ? formatDateTime(reading) : 'Aucun'}
                  </Td>
                  <Td className="text-fg-muted">
                    {machine.link === 'gateway' ? 'Passerelle industrielle' : 'Estimation déterministe'}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
