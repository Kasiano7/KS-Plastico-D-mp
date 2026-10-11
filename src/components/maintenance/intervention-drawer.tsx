'use client';

import { useEffect, useRef } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  MapPin,
  UserRoundPlus,
  Wrench,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  ASSET_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type InterventionPriority,
  type InterventionStatus,
  type MaintenanceIntervention,
} from '@/types/maintenance';

/**
 * Fiche d'intervention — tiroir latéral.
 *
 * Ouvert au clic sur une ligne de la file. C'est ce qui manquait à l'écran :
 * une liste qu'on ne peut pas ouvrir n'est qu'un tableau de plus. Les actions
 * sont présentes mais inertes tant que la GMAO n'écrit pas en base — elles le
 * disent explicitement plutôt que de faire semblant.
 */

const PRIORITY_STYLE: Record<InterventionPriority, string> = {
  critical: 'border-danger/35 bg-danger/12 text-danger',
  high: 'border-accent-orange/35 bg-accent-orange/12 text-accent-orange',
  medium: 'border-warning/35 bg-warning/12 text-warning',
  low: 'border-accent-green/35 bg-accent-green/12 text-accent-green',
};

const STATUS_STYLE: Record<InterventionStatus, string> = {
  open: 'border-danger/30 bg-danger/10 text-danger',
  planned: 'border-accent-purple/30 bg-accent-purple/10 text-accent-purple',
  in_progress: 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
  resolved: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
};

export function InterventionDrawer({
  intervention,
  onClose,
}: {
  intervention: MaintenanceIntervention | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = intervention !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      data-theme="dashboard"
      aria-label="Détail de l’intervention"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="m-0 ml-auto h-dvh max-h-none w-[min(94vw,420px)] max-w-none border-l border-edge bg-card p-0 text-ink shadow-2xl backdrop:bg-[rgb(6_14_26/0.55)]"
    >
      {intervention ? (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-medium text-primary">{intervention.id}</p>
              <h2 className="mt-0.5 truncate text-[0.9375rem] font-semibold text-ink">
                {intervention.subject}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="grid size-6 shrink-0 place-items-center rounded-chip text-ink-dim transition-colors hover:bg-background-secondary hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-wrap gap-1.5">
              <span
                className={cn(
                  'rounded-chip border px-2 py-0.5 text-[0.625rem] font-medium',
                  PRIORITY_STYLE[intervention.priority],
                )}
              >
                Priorité {PRIORITY_LABELS[intervention.priority].toLowerCase()}
              </span>
              <span
                className={cn(
                  'rounded-chip border px-2 py-0.5 text-[0.625rem] font-medium',
                  STATUS_STYLE[intervention.status],
                )}
              >
                {STATUS_LABELS[intervention.status]}
              </span>
            </div>

            <dl className="mt-5 space-y-3.5">
              <DetailRow icon={Wrench} label="Type d’actif">
                {ASSET_TYPE_LABELS[intervention.assetType]}
              </DetailRow>
              <DetailRow icon={MapPin} label="Équipement / zone">
                {intervention.equipment}
              </DetailRow>
              <DetailRow icon={UserRoundPlus} label="Assigné à">
                {intervention.assignee ?? (
                  <span className="text-accent-orange">Non affecté</span>
                )}
              </DetailRow>
              <DetailRow icon={CalendarClock} label="Échéance">
                {intervention.dueLabel}
              </DetailRow>
            </dl>

            <section className="mt-6">
              <h3 className="text-[0.625rem] font-semibold tracking-[0.12em] text-ink-dim uppercase">
                Signalement
              </h3>
              <p className="mt-2 rounded-chip border border-edge bg-background-secondary px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-muted">
                {intervention.subject}
              </p>
            </section>
          </div>

          <footer className="border-t border-edge px-4 py-3">
            <div className="grid grid-cols-3 gap-2">
              <DrawerAction icon={UserRoundPlus} label="Assigner" />
              <DrawerAction icon={CalendarClock} label="Planifier" />
              <DrawerAction icon={CheckCircle2} label="Clôturer" />
            </div>
            <p className="mt-2.5 text-[0.625rem] leading-relaxed text-ink-dim">
              Ces actions seront actives lorsque la GMAO écrira en base. Les interventions machines
              réelles se traitent dès aujourd’hui dans l’onglet Curatif.
            </p>
          </footer>
        </div>
      ) : null}
    </dialog>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Wrench;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-dim" strokeWidth={2} />
      <div className="min-w-0">
        <dt className="text-[0.625rem] text-ink-dim">{label}</dt>
        <dd className="mt-0.5 text-[0.8125rem] text-ink">{children}</dd>
      </div>
    </div>
  );
}

function DrawerAction({ icon: Icon, label }: { icon: typeof Wrench; label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Disponible lorsque la GMAO sera reliée à la base"
      className="flex flex-col items-center gap-1 rounded-chip border border-edge px-2 py-2 text-[0.625rem] font-medium text-ink-dim opacity-60"
    >
      <Icon className="size-3.5" strokeWidth={2} />
      {label}
    </button>
  );
}
