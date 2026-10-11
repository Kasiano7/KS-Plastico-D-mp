import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Info } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getMachineIdentity } from '@/server/services/machine-fleet';
import { findEventWithRelated, getMachineHistory } from '@/server/services/machine-history';
import { EventTable } from '@/components/machines/event-table';
import { EventDetailsDrawer } from '@/components/machines/event-details-drawer';
import { HistoryFilters, QuickFilters } from '@/components/machines/history-filters';
import {
  DowntimeSummary,
  HistorySummary,
  TopAlarms,
} from '@/components/machines/history-sidebar';
import { cn } from '@/lib/cn';
import styles from '@/components/machines/machines.module.css';

export const metadata: Metadata = { title: 'Historique machine' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{
  recherche?: string;
  du?: string;
  au?: string;
  type?: string;
  severite?: string;
  page?: string;
  taille?: string;
  evenement?: string;
}>;

/** Date au format d'un champ `<input type="date">`, en heure de Paris. */
function toInputDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date);
}

export default async function MachineHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  await requirePermission('machines:read');

  const { id } = await params;
  const query = await searchParams;

  const [machine, history] = await Promise.all([
    getMachineIdentity(id),
    getMachineHistory(id, {
      search: query.recherche,
      type: query.type,
      severity: query.severite,
      from: query.du,
      to: query.au,
      page: Number(query.page) || 1,
      pageSize: Number(query.taille) || 10,
    }),
  ]);

  if (!machine || !history) notFound();

  const selected = query.evenement ? findEventWithRelated(history, query.evenement) : null;
  const parent =
    selected?.event.parentEventId
      ? (history.periodEvents.find((candidate) => candidate.id === selected.event.parentEventId) ?? null)
      : null;

  const today = new Date();
  const presets = [
    { key: 'today', label: 'Aujourd’hui', days: 0 },
    { key: 'week', label: 'Cette semaine', days: 6 },
    { key: 'seven', label: '7 derniers jours', days: 6 },
    { key: 'thirty', label: '30 derniers jours', days: 29 },
  ].map((preset) => ({
    key: preset.key,
    label: preset.label,
    from: toInputDate(new Date(today.getTime() - preset.days * 86_400_000)),
    to: toInputDate(today),
  }));

  return (
    <>
      <div className={styles.historyGrid}>
        <section className={cn(styles.panel, 'overflow-hidden rounded-2xl border border-line')}>
          <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-4">
            <div>
              <h2 className="text-[1.25rem] leading-7 font-semibold text-fg">
                Historique des alertes &amp; incidents
              </h2>
              <p className="mt-1 text-[0.8125rem] text-fg-muted">Du plus récent au plus ancien</p>
            </div>
            <HistoryFilters
              machineId={machine.id}
              search={query.recherche ?? ''}
              from={toInputDate(history.from)}
              to={toInputDate(history.to)}
              type={query.type ?? 'all'}
              severity={query.severite ?? 'all'}
            />
          </header>

          <EventTable page={history.page} selectedId={query.evenement ?? null} />
        </section>

        <div className="space-y-4">
          <HistorySummary history={history} />
          <DowntimeSummary history={history} />
          <TopAlarms history={history} machineId={machine.id} />

          <section className={cn(styles.panel, 'rounded-2xl border border-line p-5')}>
            <h2 className="mb-3 text-[1.0625rem] leading-6 font-semibold text-fg">Filtres rapides</h2>
            <QuickFilters
              severity={query.severite ?? 'all'}
              from={toInputDate(history.from)}
              to={toInputDate(history.to)}
              presets={presets}
            />
          </section>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-fg-subtle">
        <Info className="size-4 shrink-0" aria-hidden />
        Les événements sont conservés pendant 12 mois. Exportez les données pour une conservation plus
        longue. Source du journal automate : {history.sourceLabel}.
      </p>

      {selected ? (
        <EventDetailsDrawer
          machineName={machine.name}
          event={selected.event}
          related={selected.related}
          parent={parent}
        />
      ) : null}
    </>
  );
}
