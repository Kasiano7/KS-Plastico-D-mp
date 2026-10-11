import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { SEVERITY_CHIP } from '@/components/ui/severity';
import type { Severity } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { MachineActionsMenu } from './machine-actions-menu';
import { MachineBreadcrumb } from './machine-breadcrumb';
import { MachineReportButton } from './machine-report-button';

/**
 * En-tête de la fiche machine : fil d'Ariane, retour au parc, identité, état,
 * et les deux commandes de droite. Rendu côté serveur ; seules les commandes
 * et le dernier maillon du fil d'Ariane sont interactifs.
 */
export function MachineHeader({
  machine,
  canWrite,
  canDeclareIncident,
  canManageFleet,
}: {
  machine: {
    id: string;
    name: string;
    model: string | null;
    manufacturer: string | null;
    status: string;
    statusLabel: string;
    severity: Severity;
    isActive: boolean;
  };
  canWrite: boolean;
  canDeclareIncident: boolean;
  canManageFleet: boolean;
}) {
  return (
    <header className="mb-5">
      <MachineBreadcrumb machineId={machine.id} machineName={machine.name} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/machines"
            prefetch={false}
            aria-label="Revenir au parc machines"
            className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] border border-line bg-surface text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-[1.625rem] leading-8 font-semibold tracking-tight text-fg">
                {machine.name}
              </h1>
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
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-sunken px-2.5 py-1 text-xs font-medium text-fg-muted">
                  Retirée du parc
                </span>
              ) : null}
            </div>
            <p className="mt-1 truncate text-[0.8125rem] text-fg-muted">
              {machine.model ?? machine.manufacturer ?? '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <MachineReportButton machineName={machine.name} />
          <MachineActionsMenu
            machineId={machine.id}
            machineName={machine.name}
            machineStatus={machine.status}
            canWrite={canWrite}
            canDeclareIncident={canDeclareIncident}
            canManageFleet={canManageFleet}
            isActive={machine.isActive}
          />
        </div>
      </div>
    </header>
  );
}
