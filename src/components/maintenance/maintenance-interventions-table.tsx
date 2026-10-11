'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Panel, PanelLink } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import {
  ASSET_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type InterventionPriority,
  type InterventionStatus,
  type MaintenanceIntervention,
} from '@/types/maintenance';
import { DemoDataBadge } from './demo-data-notice';
import { InterventionDrawer } from './intervention-drawer';

/**
 * File des interventions à traiter.
 *
 * Le filtre et la recherche restreignent la liste déjà chargée : aucun
 * rechargement, la réponse est immédiate. Chaque ligne s'ouvre — une liste
 * qu'on ne peut pas ouvrir n'est qu'un tableau de plus.
 */

/** La priorité porte une pastille : la couleur n'est jamais seule à informer. */
const PRIORITY_STYLE: Record<InterventionPriority, { dot: string; text: string }> = {
  critical: { dot: 'bg-danger', text: 'text-danger' },
  high: { dot: 'bg-accent-orange', text: 'text-accent-orange' },
  medium: { dot: 'bg-warning', text: 'text-warning' },
  low: { dot: 'bg-accent-green', text: 'text-accent-green' },
};

const STATUS_STYLE: Record<InterventionStatus, string> = {
  open: 'border-danger/30 bg-danger/10 text-danger',
  planned: 'border-accent-purple/30 bg-accent-purple/10 text-accent-purple',
  in_progress: 'border-accent-blue/30 bg-accent-blue/10 text-accent-blue',
  resolved: 'border-accent-green/30 bg-accent-green/10 text-accent-green',
};

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'critical', label: 'Critiques' },
  { id: 'high', label: 'Hautes' },
  { id: 'medium', label: 'Moyennes' },
  { id: 'low', label: 'Basses' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

/** « Rayan Masson » → « Rayan M. » : le nom complet apparaît au survol. */
function shortName(fullName: string): string {
  const [first, ...rest] = fullName.split(' ');
  return rest.length === 0 ? first : `${first} ${rest[rest.length - 1][0]}.`;
}

export function MaintenanceInterventionsTable({
  interventions,
  openCount,
  showFooterLink = true,
}: {
  interventions: MaintenanceIntervention[];
  openCount: number;
  /** Masqué sur la page dédiée, qui affiche déjà toute la liste. */
  showFooterLink?: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MaintenanceIntervention | null>(null);

  const counts = useMemo(() => {
    const base: Record<FilterId, number> = { all: openCount, critical: 0, high: 0, medium: 0, low: 0 };
    for (const item of interventions) base[item.priority] += 1;
    return base;
  }, [interventions, openCount]);

  const needle = query.trim().toLowerCase();
  const rows = interventions.filter((row) => {
    if (filter !== 'all' && row.priority !== filter) return false;
    if (needle === '') return true;
    return [row.id, row.equipment, row.subject, row.assignee ?? '', ASSET_TYPE_LABELS[row.assetType]]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  return (
    /*
     * `h-full` est indispensable : sans lui la carte prend la hauteur de ses
     * lignes et déborde par-dessus le panneau suivant au lieu de faire défiler
     * sa liste. Avec, elle se cale sur la hauteur de son emplacement et c'est
     * le corps du tableau qui se réduit — donc qui défile.
     */
    <Panel className="min-h-0 min-w-0 overflow-hidden lg:h-full">
      <header className="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-2">
        <h2 className="text-[0.8125rem] font-semibold text-ink">Interventions à traiter</h2>
        <span className="tnum rounded-chip bg-danger/12 px-1.5 py-px text-[0.6875rem] font-semibold text-danger">
          {openCount}
        </span>
        <DemoDataBadge />

        <label className="ml-auto flex h-7 min-w-[168px] items-center gap-1.5 rounded-chip border border-edge bg-background-secondary px-2 focus-within:border-primary">
          <Search aria-hidden className="size-3 shrink-0 text-ink-dim" strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une intervention"
            className="min-w-0 flex-1 bg-transparent text-[0.6875rem] text-ink placeholder:text-ink-dim focus:outline-none"
          />
        </label>
      </header>

      <div className="flex flex-wrap items-center gap-1 px-3.5 pb-2">
        {FILTERS.map((item) => {
          const isActive = item.id === filter;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={isActive}
              className={cn(
                'rounded-chip border px-2 py-[3px] text-[0.625rem] font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-edge text-ink-muted hover:border-primary/40 hover:text-ink',
              )}
            >
              {item.label}
              <span className="tnum ml-1 opacity-70">{counts[item.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
        <table className="w-full table-auto border-collapse">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              {['ID', 'Type d’actif', 'Équipement', 'Signalement', 'Priorité', 'Statut', 'Assigné à', 'Échéance'].map(
                (heading) => (
                  <th
                    key={heading}
                    className="border-b border-edge px-1.5 pt-1 pb-1.5 text-left text-[0.5625rem] font-semibold tracking-[0.08em] text-ink-dim uppercase whitespace-nowrap"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                tabIndex={0}
                role="button"
                aria-label={`Ouvrir l’intervention ${row.id}`}
                onClick={() => setSelected(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(row);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-card-hover focus-visible:bg-card-hover focus-visible:outline-none"
              >
                <td className="border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] font-medium whitespace-nowrap text-primary">
                  {row.id}
                </td>
                <td className="border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] leading-tight text-ink-muted">
                  {ASSET_TYPE_LABELS[row.assetType]}
                </td>
                <td className="border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink">
                  {row.equipment}
                </td>
                <td className="max-w-[130px] truncate border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] text-ink-muted">
                  {row.subject}
                </td>
                <td className="border-b border-edge-soft px-1.5 py-1.5 whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[0.6875rem] font-medium',
                      PRIORITY_STYLE[row.priority].text,
                    )}
                  >
                    <span aria-hidden className={cn('size-1.5 rounded-full', PRIORITY_STYLE[row.priority].dot)} />
                    {PRIORITY_LABELS[row.priority]}
                  </span>
                </td>
                <td className="border-b border-edge-soft px-1.5 py-1.5 whitespace-nowrap">
                  <span
                    className={cn(
                      'inline-flex rounded-chip border px-1.5 py-px text-[0.625rem] font-medium',
                      STATUS_STYLE[row.status],
                    )}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink-muted">
                  {row.assignee ? (
                    <span title={row.assignee}>{shortName(row.assignee)}</span>
                  ) : (
                    <span className="text-ink-dim">Non affecté</span>
                  )}
                </td>
                <td className="tnum border-b border-edge-soft px-1.5 py-1.5 text-[0.6875rem] whitespace-nowrap text-ink-dim">
                  {row.dueLabel}
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-[0.6875rem] text-ink-dim">
                  Aucune intervention ne correspond.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showFooterLink ? (
        <PanelLink href="/maintenance?onglet=interventions" align="end">
          Voir toutes les interventions
        </PanelLink>
      ) : null}

      <InterventionDrawer intervention={selected} onClose={() => setSelected(null)} />
    </Panel>
  );
}
