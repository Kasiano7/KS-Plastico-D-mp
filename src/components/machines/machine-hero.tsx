import type { MachineOverview } from '@/server/services/machine-overview';
import { Progress } from '@/components/ui/primitives';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { formatDecimal, formatNumber } from '@/lib/format';
import { OeeRing } from './gauges';
import { MachineImage } from './machine-image';
import styles from './machines.module.css';

/** Durée écoulée depuis un instant, au format « 02h45 » de la maquette. */
function elapsedSince(since: Date, reference: Date): string {
  const minutes = Math.max(Math.round((reference.getTime() - since.getTime()) / 60_000), 0);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}h${String(minutes % 60).padStart(2, '0')}`;
}

function Column({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 px-5 py-5 xl:border-l xl:border-line xl:first:border-l-0', className)}>
      {children}
    </div>
  );
}

function Entry({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.75rem] text-fg-muted">{label}</dt>
      <dd className="mt-1 text-[0.9375rem] font-semibold text-fg">{children}</dd>
    </div>
  );
}

/**
 * Bandeau principal de la fiche machine : illustration, TRS, état, production
 * du jour et référence en cours. Cinq blocs séparés par un filet vertical.
 */
export function MachineHero({ machine }: { machine: MachineOverview }) {
  const { production, currentOrder } = machine;

  return (
    <section
      className={cn(styles.panel, styles.heroGrid, 'mb-4 overflow-hidden rounded-2xl border border-line')}
    >
      <div className="relative min-h-[12rem] px-5 py-5">
        <MachineImage
          imageKey={machine.imageKey}
          photoUrl={machine.photoUrl}
          machineName={machine.name}
          sizes="(min-width: 82rem) 22vw, 90vw"
          priority
        />
      </div>

      <Column>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.75rem] text-fg-muted">TRS</p>
            <p className="tabular mt-1 text-[1.75rem] leading-none font-semibold text-fg">
              {Math.round(machine.oee.oeePct)}%
            </p>
            <p
              className={cn(
                'mt-2 flex items-center gap-1.5 text-[0.8125rem] font-medium',
                SEVERITY_TEXT[machine.oeeVerdict.severity],
              )}
            >
              <span aria-hidden className="size-2 rounded-full bg-current" />
              {machine.oeeVerdict.label}
            </p>
          </div>
          <OeeRing
            value={machine.oee.oeePct}
            severity={machine.oeeVerdict.severity}
            size={56}
            thickness={5}
            label={`TRS ${Math.round(machine.oee.oeePct)} %`}
          />
        </div>

        <dl className="mt-5 space-y-4 border-t border-line pt-4">
          <Entry label="Cycle actuel">
            {machine.cycleTimeSeconds ? `${formatDecimal(machine.cycleTimeSeconds)} s` : '—'}
          </Entry>
          <Entry label="Cycle théorique">
            {machine.theoreticalCycleSeconds ? `${formatDecimal(machine.theoreticalCycleSeconds)} s` : '—'}
          </Entry>
        </dl>
      </Column>

      <Column>
        <p className="text-[0.75rem] text-fg-muted">État machine</p>
        <p
          className={cn(
            'mt-2 flex items-center gap-2 text-[0.9375rem] font-semibold',
            SEVERITY_TEXT[machine.severity],
          )}
        >
          <span aria-hidden className="size-2 rounded-full bg-current" />
          {machine.statusLabel}
        </p>
        <dl className="mt-5 space-y-4">
          <Entry label="Depuis">{elapsedSince(machine.statusSince, machine.capturedAt)}</Entry>
          <Entry label="Démarrée par">{machine.startedBy ?? '—'}</Entry>
          <Entry label="Équipe">{machine.shiftLabel ?? '—'}</Entry>
        </dl>
      </Column>

      <Column>
        <p className="text-[0.75rem] text-fg-muted">Production aujourd’hui</p>
        <dl className="mt-3 space-y-4">
          <Entry label="Pièces bonnes">{formatNumber(production.goodUnits)}</Entry>
          <div>
            <dt className="text-[0.75rem] text-fg-muted">Pièces rebutées</dt>
            <dd className="tabular mt-1 text-[0.9375rem] font-semibold text-critical">
              {formatNumber(production.rejectedUnits)}{' '}
              <span className="text-[0.8125rem] font-medium">
                ({formatDecimal(production.rejectRatePct)}%)
              </span>
            </dd>
          </div>
          <Entry label="Objectif">{formatNumber(production.targetUnits)}</Entry>
          <div>
            <dt className="text-[0.75rem] text-fg-muted">Avancement</dt>
            <dd className="mt-2 flex items-center gap-3">
              <Progress
                value={production.achievementPct}
                severity={production.achievementPct >= 80 ? 'normal' : 'warning'}
                className="h-1.5"
                label={`Avancement de l’objectif de ${machine.name}`}
              />
              <span className="tabular shrink-0 text-[0.8125rem] font-semibold text-fg">
                {production.achievementPct}%
              </span>
            </dd>
          </div>
        </dl>
      </Column>

      <Column>
        <p className="text-[0.75rem] text-fg-muted">Référence en cours</p>
        {currentOrder ? (
          <dl className="mt-2 space-y-4">
            <dd className="text-[1.0625rem] leading-6 font-semibold text-fg">
              {currentOrder.productReference}
            </dd>
            <Entry label="Matière">{currentOrder.material ?? '—'}</Entry>
            <Entry label="Couleur">{currentOrder.color ?? '—'}</Entry>
            <Entry label="Poids pièce">
              {currentOrder.partWeightGrams > 0
                ? `${formatDecimal(currentOrder.partWeightGrams)} g`
                : '—'}
            </Entry>
            <Entry label="Nbre d’empreintes">{currentOrder.cavities ?? '—'}</Entry>
          </dl>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-6 text-fg-muted">
            Aucun ordre de fabrication en cours sur cette presse.
          </p>
        )}
      </Column>
    </section>
  );
}
