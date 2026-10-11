'use client';

import { useCallback, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { inputClass } from '@/components/ui/primitives';
import { FLEET_STATES, FLEET_VIEWS, type FleetViewKey } from './fleet-view-keys';

/**
 * Barre d'outils du parc : vues, filtres et compteur de liaison.
 *
 * Les filtres vivent dans l'URL — une vue filtrée se partage, se met en
 * favori et survit à un rafraîchissement. Le filtrage lui-même reste serveur.
 */

export function FleetToolbar({
  view,
  workshops,
  workshopId,
  state,
  search,
  connectedCount,
  totalCount,
  connectionTitle,
}: {
  view: FleetViewKey;
  workshops: { id: string; name: string; machineCount: number }[];
  workshopId: string;
  state: string;
  search: string;
  connectedCount: number;
  totalCount: number;
  connectionTitle: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const hasFilters = state !== 'all' || search.length > 0;
  const [filtersOpen, setFiltersOpen] = useState(hasFilters);
  const [searchDraft, setSearchDraft] = useState(search);

  const push = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Vues du parc machines"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1.5"
        >
          {FLEET_VIEWS.map((entry) => {
            const active = entry.key === view;
            return (
              <button
                key={entry.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => push({ vue: entry.key === 'ensemble' ? null : entry.key })}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                  active
                    ? 'border border-brand/45 bg-brand-soft text-brand'
                    : 'border border-transparent text-fg-muted hover:bg-surface-raised hover:text-fg',
                )}
              >
                <entry.icon className="size-4" aria-hidden />
                {entry.label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filtrer par atelier"
            className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1.5"
          >
            <button
              type="button"
              aria-current={workshopId === 'all' ? 'true' : undefined}
              onClick={() => push({ atelier: null })}
              className={cn(
                'inline-flex items-center rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                workshopId === 'all'
                  ? 'border border-brand/45 bg-brand-soft text-brand'
                  : 'border border-transparent text-fg-muted hover:bg-surface-raised hover:text-fg',
              )}
            >
              Tous les ateliers
            </button>
            {workshops.map((workshop) => {
              const active = workshopId === workshop.id;
              return (
                <button
                  key={workshop.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => push({ atelier: workshop.id })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                    active
                      ? 'border border-brand/45 bg-brand-soft text-brand'
                      : 'border border-transparent text-fg-muted hover:bg-surface-raised hover:text-fg',
                  )}
                >
                  {workshop.name}
                  <span className={cn('tabular text-xs', active ? 'text-brand/70' : 'text-fg-subtle')}>
                    ({workshop.machineCount})
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((value) => !value)}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border px-3.5 text-[0.8125rem] font-medium transition-colors',
              filtersOpen || hasFilters
                ? 'border-brand/45 bg-brand-soft text-brand'
                : 'border-line-strong bg-surface text-fg hover:bg-surface-raised',
            )}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtres
            {hasFilters ? (
              <span className="tabular rounded-full bg-brand px-1.5 text-[0.625rem] font-semibold text-white">
                {(state !== 'all' ? 1 : 0) + (search ? 1 : 0)}
              </span>
            ) : null}
          </button>

          <span
            title={connectionTitle}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-fg"
          >
            <span aria-hidden className="size-2 rounded-full bg-normal" />
            <span className="tabular">
              {connectedCount} / {totalCount}
            </span>
            connectées
          </span>
        </div>
      </div>

      {filtersOpen ? (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
          <label className="min-w-56 flex-1">
            <span className="mb-1.5 block text-xs font-medium text-fg-muted">Rechercher</span>
            <span className="relative block">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
              <input
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onBlur={() => push({ recherche: searchDraft })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') push({ recherche: searchDraft });
                }}
                placeholder="Nom, code, modèle, ordre en cours…"
                className={cn(inputClass, 'h-10 pl-9')}
              />
            </span>
          </label>

          <label className="min-w-48">
            <span className="mb-1.5 block text-xs font-medium text-fg-muted">État machine</span>
            <span className="relative block">
              <select
                value={state}
                onChange={(event) => push({ etat: event.target.value })}
                className={cn(inputClass, 'h-10 appearance-none pr-9')}
              >
                {FLEET_STATES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
                aria-hidden
              />
            </span>
          </label>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchDraft('');
                push({ etat: null, recherche: null });
              }}
              className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] px-3 text-[0.8125rem] font-medium text-fg-muted hover:text-fg"
            >
              <X className="size-4" aria-hidden />
              Réinitialiser
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
