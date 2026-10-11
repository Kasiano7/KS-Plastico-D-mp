'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  Download,
  History,
  ListChecks,
  Pencil,
  Power,
  Settings2,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { buttonClass } from '@/components/ui/primitives';
import { setMachineActiveAction, type ActionState } from '@/server/actions/machines';
import { RETIRE_BLOCKED_STATUSES } from '@/server/domain/machines';

/**
 * Menu « Actions » de la fiche machine.
 *
 * Il n'expose que des destinations réelles, filtrées par les permissions du
 * serveur : masquer une entrée n'est pas une sécurité, la page d'arrivée et
 * l'action revérifient toujours le droit.
 */

export function MachineActionsMenu({
  machineId,
  machineName,
  machineStatus,
  canWrite,
  canDeclareIncident,
  canManageFleet,
  isActive,
}: {
  machineId: string;
  machineName: string;
  machineStatus: string;
  canWrite: boolean;
  canDeclareIncident: boolean;
  canManageFleet: boolean;
  isActive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const toggleFormRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(setMachineActiveAction, {});

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const entries = [
    canWrite && {
      key: 'modifier',
      label: 'Modifier la fiche',
      icon: Pencil,
      href: `/machines/${machineId}/modifier`,
    },
    canWrite && {
      key: 'etat',
      label: 'Changer l’état de la presse',
      icon: Settings2,
      href: `/machines/${machineId}/arrets#changer-etat`,
    },
    canDeclareIncident && {
      key: 'incident',
      label: 'Déclarer un incident',
      icon: TriangleAlert,
      href: `/machines/${machineId}/arrets#declarer-incident`,
    },
    { key: 'production', label: 'Ordres de fabrication', icon: ListChecks, href: `/machines/${machineId}/production` },
    { key: 'maintenance', label: 'Plan de maintenance', icon: Wrench, href: `/machines/${machineId}/maintenance` },
    { key: 'historique', label: 'Historique complet', icon: History, href: `/machines/${machineId}/historique` },
    {
      key: 'export',
      label: 'Exporter les événements (CSV)',
      icon: Download,
      href: `/machines/${machineId}/historique/export`,
    },
  ].filter(Boolean) as { key: string; label: string; icon: typeof Settings2; href: string }[];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={buttonClass('primary', 'md', 'h-10 px-4')}
      >
        Actions
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Actions pour ${machineName}`}
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--shadow-float)]"
        >
          {entries.map((entry) => (
            <Link
              key={entry.key}
              role="menuitem"
              href={entry.href}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              <entry.icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              {entry.label}
            </Link>
          ))}

          {canManageFleet ? (
            <form ref={toggleFormRef} action={toggleAction} className="border-t border-line">
              <input type="hidden" name="machineId" value={machineId} />
              <input type="hidden" name="isActive" value={isActive ? 'false' : 'true'} />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);

                  /*
                   * Une presse en production ne se retire pas : le refus est
                   * annoncé par un toast, lisible aussi par un lecteur d'écran
                   * — ce que `window.alert` ne permettait pas.
                   */
                  if (isActive && RETIRE_BLOCKED_STATUSES.has(machineStatus)) {
                    toast({
                      title: 'Retrait impossible',
                      description: `${machineName} est en cours d’utilisation (${machineStatus}). Arrêtez-la d’abord.`,
                      tone: 'warning',
                    });
                    return;
                  }

                  // La réactivation est sans risque : elle ne demande rien.
                  if (!isActive) {
                    toggleFormRef.current?.requestSubmit();
                    return;
                  }

                  setRetiring(true);
                }}
                role="menuitem"
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] transition-colors hover:bg-surface-sunken',
                  isActive ? 'text-critical' : 'text-normal',
                )}
              >
                <Power className="size-4 shrink-0" aria-hidden />
                {isActive ? 'Retirer du parc' : 'Réactiver la machine'}
              </button>

              <ConfirmDialog
                open={retiring}
                title={`Retirer ${machineName} du parc actif ?`}
                description="La presse disparaîtra du planning tant qu’elle n’est pas réactivée. Son historique et ses documents sont conservés."
                confirmLabel="Retirer du parc"
                onCancel={() => setRetiring(false)}
                onConfirm={() => {
                  setRetiring(false);
                  toggleFormRef.current?.requestSubmit();
                }}
              />
            </form>
          ) : null}
        </div>
      ) : null}

      {toggleState.message && !toggleState.ok ? (
        <p role="alert" className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-xs text-critical shadow-[var(--shadow-float)]">
          {toggleState.message}
        </p>
      ) : null}
    </div>
  );
}
