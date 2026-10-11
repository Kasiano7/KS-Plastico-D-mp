import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getMachineOverview } from '@/server/services/machine-overview';
import {
  ConsumptionCard,
  Panel,
  TemperatureCard,
} from '@/components/machines/overview-cards';
import { SignalBar } from '@/components/machines/gauges';
import { DataOrigin } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCents, formatDecimal } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';


export async function EnergyView({ id }: { id: string }) {
  const user = await requirePermission('machines:read');
  const machine = await getMachineOverview(id);
  if (!machine) notFound();

  const { consumption } = machine.signals;
  const producedUnits = machine.production.goodUnits;
  const kwhPerPart = producedUnits > 0 ? consumption.electricityKwh / producedUnits : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Électricité sur 24 h"
          value={`${formatDecimal(consumption.electricityKwh)} kWh`}
          hint={`${formatDecimal(consumption.electricityAverageKw)} kW en moyenne`}
          origin={machine.signalsMeasured ? 'measured' : 'estimated'}
        />
        <Tile
          label="Puissance instantanée"
          value={`${formatDecimal(machine.signals.totalKw)} kW`}
          hint={`dont ${formatDecimal(machine.signals.hydraulicKw)} kW hydraulique`}
          origin={machine.signalsMeasured ? 'measured' : 'estimated'}
        />
        <Tile
          label="Énergie par pièce bonne"
          value={kwhPerPart === null ? '—' : `${formatDecimal(kwhPerPart)} kWh`}
          hint={kwhPerPart === null ? 'Aucune pièce produite aujourd’hui' : 'Sur la production du jour'}
          origin="computed"
        />
        {can(user.permissions, 'finance:read') ? (
          <Tile
            label="Coût horaire machine"
            value={machine.hourlyCostCents > 0 ? formatCents(machine.hourlyCostCents) : '—'}
            hint="Coût horaire saisi dans la fiche machine"
          />
        ) : (
          <Tile
            label="Tonnage de fermeture"
            value={machine.tonnage > 0 ? `${machine.tonnage} T` : '—'}
            hint="Pilote l’ordre de grandeur des consommations"
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Panel
          title="Signaux énergétiques"
          action={<DataOrigin origin={machine.signalsMeasured ? 'measured' : 'estimated'} />}
        >
          <dl className="space-y-3">
            {machine.signalRows
              .filter((row) => ['hydraulic-power', 'total-power', 'oil-level', 'material-level'].includes(row.key))
              .map((row) => (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_7rem_5rem] items-center gap-3">
                  <dt className="truncate text-[0.8125rem] text-fg-muted">{row.label}</dt>
                  <SignalBar fillPct={row.fillPct} tone={row.tone} />
                  <dd className="tabular text-right text-[0.8125rem] font-semibold text-fg">{row.display}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-5 text-fg-subtle">{machine.signalsProviderLabel}</p>
        </Panel>

        <div className="space-y-4">
          <ConsumptionCard machine={machine} />
          <TemperatureCard machine={machine} />
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
  origin,
}: {
  label: string;
  value: string;
  hint: string;
  /** Absent pour une donnée de référence (plaque signalétique) : ni mesure, ni calcul. */
  origin?: 'measured' | 'computed' | 'estimated';
}) {
  return (
    <div className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
      <p className="text-[0.8125rem] text-fg-muted">{label}</p>
      <p className="tabular mt-2 text-[1.625rem] leading-none font-semibold text-fg">{value}</p>
      <p className="mt-2 text-xs text-fg-subtle">{hint}</p>
      {origin ? <DataOrigin origin={origin} className="mt-3" /> : null}
    </div>
  );
}
