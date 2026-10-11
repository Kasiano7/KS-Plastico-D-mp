'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { GitBranch, X } from 'lucide-react';
import {
  EVENT_IMPACT_LABELS,
  EVENT_SEVERITY_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  formatEventDuration,
  type MachineEventRecord,
} from '@/server/domain/machine-events';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { EVENT_SEVERITY_CHIP, EVENT_TYPE_ICON } from './event-presentation';
import styles from './machines.module.css';

/**
 * Tiroir de détail d'un événement.
 *
 * Il s'ouvre sans quitter la page : l'événement sélectionné est un paramètre
 * d'URL, donc le contenu est rendu par le serveur et le lien reste partageable.
 * Le composant n'est client que pour la fermeture (Échap, clic extérieur).
 */

const STATUS_STYLE = {
  open: 'border-critical/40 bg-critical-soft text-critical',
  acknowledged: 'border-warning/40 bg-warning-soft text-warning',
  resolved: 'border-normal/40 bg-normal-soft text-normal',
} as const;

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Paris',
});

export function EventDetailsDrawer({
  machineName,
  event,
  related,
  parent,
}: {
  machineName: string;
  event: MachineEventRecord;
  related: MachineEventRecord[];
  parent: MachineEventRecord | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const close = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.delete('evenement');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const Icon = EVENT_TYPE_ICON[event.type];

  const rows: { label: string; value: string }[] = [
    { label: 'Machine', value: machineName },
    { label: 'Date et heure', value: dateTimeFormat.format(event.occurredAt).replace(',', '') },
    { label: 'Code', value: event.code },
    { label: 'Type', value: EVENT_TYPE_LABELS[event.type] },
    { label: 'Criticité', value: EVENT_SEVERITY_LABELS[event.severity] },
    { label: 'Début', value: dateTimeFormat.format(event.occurredAt).replace(',', '') },
    {
      label: 'Fin',
      value: event.endedAt ? dateTimeFormat.format(event.endedAt).replace(',', '') : 'En cours',
    },
    { label: 'Durée', value: formatEventDuration(event.durationSeconds) },
    { label: 'Impact production', value: EVENT_IMPACT_LABELS[event.impact] },
    { label: 'Opérateur', value: event.operator ?? '—' },
    { label: 'Équipe', value: event.shift ?? '—' },
    { label: 'Référence produite', value: event.productReference ?? '—' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fermer le détail de l’événement"
        onClick={close}
        className="absolute inset-0 bg-overlay"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Détail de l’événement ${event.code}`}
        className={cn(
          styles.drawer,
          'relative flex h-full w-full max-w-[30rem] flex-col overflow-y-auto border-l border-line-strong',
        )}
      >
        <header className="sticky top-0 z-10 border-b border-line bg-inherit px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[0.75rem] text-fg-muted">
                <Icon className="size-4 shrink-0" aria-hidden />
                {EVENT_TYPE_LABELS[event.type]} · {event.code}
              </p>
              <h2 className="mt-1.5 text-[1.125rem] leading-6 font-semibold text-fg">{event.title}</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium',
                EVENT_SEVERITY_CHIP[event.severity],
              )}
            >
              {EVENT_SEVERITY_LABELS[event.severity]}
            </span>
            <span
              className={cn(
                'rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium',
                STATUS_STYLE[event.status],
              )}
            >
              {EVENT_STATUS_LABELS[event.status]}
            </span>
            <span className="rounded-lg border border-line px-2.5 py-1 text-[0.75rem] text-fg-muted">
              {event.source === 'application' ? 'Trace applicative' : 'Journal automate'}
            </span>
          </div>
        </header>

        <div className="space-y-5 px-5 py-5">
          <p className="text-[0.875rem] leading-6 text-fg-muted">{event.description}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[0.75rem] text-fg-muted">{row.label}</dt>
                <dd className="tabular mt-0.5 truncate text-[0.8125rem] font-medium text-fg">{row.value}</dd>
              </div>
            ))}
          </dl>

          {event.productionImpact ? (
            <section>
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-fg">Impact production</h3>
              <dl className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Temps perdu', value: formatEventDuration(event.productionImpact.downtimeSeconds) },
                  { label: 'Pièces perdues', value: formatNumber(event.productionImpact.lostParts) },
                  { label: 'Rebuts', value: formatNumber(event.productionImpact.rejectedParts) },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-xl border border-line bg-surface-sunken px-3 py-2.5">
                    <dt className="text-[0.6875rem] text-fg-muted">{tile.label}</dt>
                    <dd className="tabular mt-1 text-[0.9375rem] font-semibold text-fg">{tile.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {event.readings.length > 0 ? (
            <section>
              <h3 className="mb-2 text-[0.8125rem] font-semibold text-fg">Valeurs machine au moment de l’événement</h3>
              <dl className="space-y-2">
                {event.readings.map((reading) => (
                  <div
                    key={reading.label}
                    className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0"
                  >
                    <dt className="text-[0.8125rem] text-fg-muted">{reading.label}</dt>
                    <dd className="tabular text-[0.8125rem] font-medium text-fg">{reading.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {parent || related.length > 0 ? (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[0.8125rem] font-semibold text-fg">
                <GitBranch className="size-4 text-fg-subtle" aria-hidden />
                Corrélation des alarmes
              </h3>
              {parent ? (
                <p className="mb-2 rounded-xl border border-line bg-surface-sunken px-3 py-2.5 text-[0.8125rem] text-fg-muted">
                  Conséquence de l’incident principal{' '}
                  <span className="font-medium text-fg">
                    {parent.code} — {parent.title}
                  </span>
                  .
                </p>
              ) : null}
              {related.length > 0 ? (
                <>
                  <p className="mb-2 text-[0.75rem] text-fg-muted">
                    {related.length} alarme(s) déclenchée(s) par cette même panne — comptées une seule fois
                    dans le temps d’arrêt.
                  </p>
                  <ul className="space-y-1.5">
                    {related.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[0.8125rem]"
                      >
                        <span className="min-w-0">
                          <span className="tabular text-fg-muted">{child.code}</span>{' '}
                          <span className="text-fg">{child.title}</span>
                        </span>
                        <span className="tabular shrink-0 text-fg-subtle">
                          {formatEventDuration(child.durationSeconds)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}

          <section>
            <h3 className="mb-2 text-[0.8125rem] font-semibold text-fg">Action corrective</h3>
            <p className="text-[0.8125rem] leading-6 text-fg-muted">
              {event.correctiveAction ?? 'Aucune action corrective enregistrée.'}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-[0.8125rem] font-semibold text-fg">Commentaire maintenance</h3>
            <p className="text-[0.8125rem] leading-6 text-fg-muted">
              {event.maintenanceComment ?? 'Aucun commentaire de maintenance.'}
            </p>
          </section>
        </div>
      </aside>
    </div>
  );
}
