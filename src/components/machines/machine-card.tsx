import Link from 'next/link';
import { ChevronRight, TriangleAlert } from 'lucide-react';
import type { MachineCardModel } from '@/server/services/machine-fleet';
import { oeeVerdict } from '@/server/domain/machines';
import { SEVERITY_CHIP, SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDecimal, formatNumber } from '@/lib/format';
import { ActivityChart, OeeRing } from './gauges';
import { MachineImage } from './machine-image';
import { MachineCardMenu } from './machine-card-menu';
import styles from './machines.module.css';

/**
 * Carte d'une presse dans le parc — générique : une seule carte pour les
 * constructeurs A, B et C, seule l'illustration change.
 *
 * La carte entière est cliquable, sauf le menu « … » qui vit au-dessus du lien
 * (un bouton imbriqué dans un lien serait invalide et inaccessible).
 */
export function MachineCard({ machine }: { machine: MachineCardModel }) {
  // Une presse disponible affiche 0 % : ce n'est pas un TRS critique, c'est une
  // absence de production. Le rouge reste réservé à un vrai problème (§6).
  const idle = machine.oeePct === 0;
  const oeeSeverity = oeeVerdict(machine.oeePct).severity;
  const detailHref = `/machines/${machine.id}`;

  return (
    <article
      className={cn(
        styles.machineCard,
        'group relative flex flex-col overflow-hidden rounded-2xl border transition-colors duration-200',
        machine.severity === 'critical' ? 'border-critical/35' : 'border-line',
        'hover:border-line-strong',
      )}
    >
      <Link
        href={detailHref}
        prefetch={false}
        aria-label={`Ouvrir la fiche de ${machine.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h3 className="truncate text-[1.125rem] leading-6 font-semibold text-fg">{machine.name}</h3>
          <p className="mt-1 truncate text-[0.8125rem] text-fg-muted">
            {machine.model ?? machine.manufacturer ?? machine.code}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
              SEVERITY_CHIP[machine.severity],
            )}
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {machine.statusLabel}
          </span>
          {!machine.isActive ? (
            <span className="inline-flex items-center rounded-lg border border-line-strong bg-surface-sunken px-2.5 py-1 text-xs font-medium text-fg-muted">
              Retirée
            </span>
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 px-5 pt-2">
        <div className="relative h-[9.5rem] min-w-0">
          <MachineImage
            imageKey={machine.imageKey}
            photoUrl={machine.photoUrl}
            machineName={machine.name}
            sizes="(min-width: 82rem) 22vw, (min-width: 60rem) 32vw, 70vw"
          />
        </div>

        <dl className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <dt className="text-[0.8125rem] text-fg-muted">TRS</dt>
              <dd
                className={cn(
                  'tabular mt-1 text-[1.5rem] leading-none font-semibold',
                  idle ? 'text-fg' : SEVERITY_TEXT[oeeSeverity],
                )}
              >
                {Math.round(machine.oeePct)}%
              </dd>
            </div>
            <OeeRing
              value={machine.oeePct}
              severity={idle ? 'info' : oeeSeverity}
              muted={idle}
              size={46}
              label={`TRS de ${machine.name} : ${Math.round(machine.oeePct)} %`}
            />
          </div>
          <div>
            <dt className="text-[0.8125rem] text-fg-muted">Cycle</dt>
            <dd className="tabular mt-1 text-[1.5rem] leading-none font-semibold text-fg">
              {machine.cycleTimeSeconds ? `${formatDecimal(machine.cycleTimeSeconds)} s` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-fg-muted">Pièces</dt>
            <dd className="tabular mt-1 text-[1.5rem] leading-none font-semibold text-fg">
              {formatNumber(machine.producedUnits)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="pointer-events-none relative z-10 mt-2 px-5">
        <ActivityChart
          values={machine.activitySeries}
          ariaLabel={`Part productive de ${machine.name} sur les 24 dernières heures`}
        />
      </div>

      {/* « Arrêt machine » est le libellé le plus long : la première colonne
          respire un peu plus pour ne pas le tronquer sur un écran 1440. */}
      <div className="relative z-10 mt-auto grid grid-cols-[1.25fr_1fr_1fr_auto] items-end gap-3 border-t border-line px-5 py-4">
        <div className="pointer-events-none min-w-0">
          <p className="text-[0.75rem] text-fg-muted">État</p>
          <p
            className={cn(
              'mt-1 flex items-center gap-1.5 text-[1.0625rem] font-medium',
              SEVERITY_TEXT[machine.stateSeverity],
            )}
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
            <span className="truncate">{machine.stateLabel}</span>
          </p>
        </div>
        <div className="pointer-events-none min-w-0">
          <p className="text-[0.75rem] text-fg-muted">T° moule</p>
          <p className="tabular mt-1 truncate text-[1.0625rem] font-medium text-fg">
            {machine.moldTemperatureC > 0 ? `${formatDecimal(machine.moldTemperatureC)} °C` : '—'}
          </p>
        </div>
        <div className="pointer-events-none min-w-0">
          <p className="text-[0.75rem] text-fg-muted">Conso.</p>
          <p className="tabular mt-1 truncate text-[1.0625rem] font-medium text-fg">
            {formatDecimal(machine.energyKwh)} kWh
          </p>
        </div>
        <MachineCardMenu machineId={machine.id} machineName={machine.name} />
      </div>

      {machine.faultMessage ? (
        <div className="relative z-10 flex items-center justify-between gap-3 border-t border-critical/25 bg-critical-soft px-5 py-3">
          <p className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-medium text-critical">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{machine.faultMessage}</span>
          </p>
          <Link
            href={`/machines/${machine.id}/historique`}
            prefetch={false}
            className="relative z-20 inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-medium text-critical hover:underline"
          >
            Voir les détails
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      ) : null}
    </article>
  );
}
