import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { getMachineOverview } from '@/server/services/machine-overview';
import { getMachineDetail } from '@/server/services/machines';
import { Panel } from '@/components/machines/overview-cards';
import { SignalBar } from '@/components/machines/gauges';
import { DataOrigin, Table, Td, Th, Tr } from '@/components/ui/primitives';
import { SEVERITY_TEXT, type Severity } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDecimal, formatNumber } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';


export async function CyclesView({ id }: { id: string }) {
  await requirePermission('machines:read');

  const [overview, detail] = await Promise.all([getMachineOverview(id), getMachineDetail(id)]);
  if (!overview || !detail) notFound();

  const actual = overview.cycleTimeSeconds;
  const theoretical = overview.theoreticalCycleSeconds;
  const driftPct =
    actual && theoretical && theoretical > 0 ? ((actual - theoretical) / theoretical) * 100 : null;
  const driftSeverity: Severity =
    driftPct === null ? 'info' : driftPct > 10 ? 'critical' : driftPct > 3 ? 'warning' : 'normal';

  const tiles = [
    {
      label: 'Cycle actuel',
      value: actual ? `${formatDecimal(actual)} s` : '—',
      hint: 'Relevé de la télémétrie',
      className: 'text-fg',
      origin: overview.cycleTimeMeasured ? ('measured' as const) : ('estimated' as const),
    },
    {
      label: 'Cycle théorique',
      value: theoretical ? `${formatDecimal(theoretical)} s` : '—',
      hint: 'Temps de cycle de la référence en cours',
      className: 'text-fg',
      origin: 'computed' as const,
    },
    {
      label: 'Dérive',
      value: driftPct === null ? '—' : `${driftPct > 0 ? '+' : ''}${formatDecimal(driftPct)} %`,
      hint: driftPct === null ? 'Presse à l’arrêt' : 'Écart au cycle théorique',
      className: SEVERITY_TEXT[driftSeverity],
      origin: 'computed' as const,
    },
    {
      label: 'Performance du jour',
      value: `${formatDecimal(overview.oee.performancePct)} %`,
      hint: 'Composante « performance » du TRS',
      className: 'text-fg',
      origin: 'computed' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
            <p className="text-[0.8125rem] text-fg-muted">{tile.label}</p>
            <p className={cn('tabular mt-2 text-[1.625rem] leading-none font-semibold', tile.className)}>
              {tile.value}
            </p>
            <p className="mt-2 text-xs text-fg-subtle">{tile.hint}</p>
            <DataOrigin origin={tile.origin} className="mt-3" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Panel
          title="Cycle par référence"
          hint="Cadence retenue au planning et temps de cycle correspondant"
          bodyClassName="px-0 pb-0"
        >
          {detail.compatibleProducts.length === 0 ? (
            <p className="px-5 pb-5 text-[0.8125rem] text-fg-muted">
              Aucune référence déclarée compatible avec cette presse.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Référence</Th>
                  <Th>Pièce</Th>
                  <Th numeric>Cadence</Th>
                  <Th numeric>Cycle correspondant</Th>
                </tr>
              </thead>
              <tbody>
                {detail.compatibleProducts.map((product) => (
                  <Tr key={product.productReference}>
                    <Td className="font-medium">{product.productReference}</Td>
                    <Td className="text-fg-muted">{product.productName}</Td>
                    <Td numeric className="text-fg-muted">
                      {formatNumber(product.unitsPerHour)} p/h
                    </Td>
                    <Td numeric>
                      {product.unitsPerHour > 0 ? `${formatDecimal(3_600 / product.unitsPerHour)} s` : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel
          title="Paramètres de cycle"
          action={<DataOrigin origin={overview.signalsMeasured ? 'measured' : 'estimated'} />}
        >
          <dl className="space-y-3">
            {overview.signalRows
              .filter((row) =>
                ['injection-pressure', 'holding-pressure', 'screw-speed', 'nozzle-temperature', 'mold-temperature'].includes(
                  row.key,
                ),
              )
              .map((row) => (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_6rem_4.5rem] items-center gap-3">
                  <dt className="truncate text-[0.8125rem] text-fg-muted">{row.label}</dt>
                  <SignalBar fillPct={row.fillPct} tone={row.tone} />
                  <dd className="tabular text-right text-[0.8125rem] font-semibold text-fg">{row.display}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-5 text-fg-subtle">{overview.signalsProviderLabel}</p>
        </Panel>
      </div>
    </div>
  );
}
