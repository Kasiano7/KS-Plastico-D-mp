'use client';

import { useCallback, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Download, MoveRight, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { inputClass } from '@/components/ui/primitives';
import {
  EVENT_SEVERITY_LABELS,
  EVENT_TYPE_LABELS,
  type MachineEventSeverity,
  type MachineEventType,
} from '@/server/domain/machine-events';

/**
 * Filtres de l'historique : recherche, période, type, sévérité, export.
 *
 * Tous les filtres vivent dans l'URL. Le tri et le filtrage restent faits par
 * le serveur : la page reste juste, même si le navigateur ne charge jamais le
 * JavaScript.
 */
export function HistoryFilters({
  machineId,
  search,
  from,
  to,
  type,
  severity,
}: {
  machineId: string;
  search: string;
  from: string;
  to: string;
  type: string;
  severity: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(search);

  const push = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      // Tout changement de filtre ramène à la première page : rester en page 7
      // d'une liste devenue plus courte n'aurait aucun sens.
      next.delete('page');
      next.delete('evenement');
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  const exportQuery = new URLSearchParams(params.toString());
  exportQuery.delete('page');
  exportQuery.delete('evenement');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-56 flex-1">
        <span className="sr-only">Rechercher un événement</span>
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          value={searchDraft}
          onChange={(event) => setSearchDraft(event.target.value)}
          onBlur={() => push({ recherche: searchDraft })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') push({ recherche: searchDraft });
          }}
          placeholder="Rechercher un événement..."
          className={cn(inputClass, 'h-10 pl-9')}
        />
      </label>

      <div className="flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3">
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Date de début</span>
          {/* Un seul sélecteur de date visible : celui de la borne de fin. */}
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => push({ du: event.target.value })}
            className="tabular bg-transparent text-[0.8125rem] text-fg outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
          />
        </label>
        <MoveRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <label className="flex items-center gap-1.5">
          <span className="sr-only">Date de fin</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => push({ au: event.target.value })}
            className="tabular bg-transparent text-[0.8125rem] text-fg outline-none [color-scheme:dark]"
          />
        </label>
      </div>

      <label className="relative">
        <span className="sr-only">Filtrer par type</span>
        <select
          value={type}
          onChange={(event) => push({ type: event.target.value })}
          className={cn(inputClass, 'h-10 appearance-none pr-9 text-[0.8125rem]')}
        >
          <option value="all">Tous les types</option>
          {(Object.keys(EVENT_TYPE_LABELS) as MachineEventType[]).map((key) => (
            <option key={key} value={key}>
              {EVENT_TYPE_LABELS[key]}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
      </label>

      <label className="relative">
        <span className="sr-only">Filtrer par sévérité</span>
        <select
          value={severity}
          onChange={(event) => push({ severite: event.target.value })}
          className={cn(inputClass, 'h-10 appearance-none pr-9 text-[0.8125rem]')}
        >
          <option value="all">Toutes les sévérités</option>
          {(Object.keys(EVENT_SEVERITY_LABELS) as MachineEventSeverity[]).map((key) => (
            <option key={key} value={key}>
              {EVENT_SEVERITY_LABELS[key]}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
      </label>

      <a
        href={`/machines/${machineId}/historique/export?${exportQuery.toString()}`}
        className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-[0.8125rem] font-medium text-fg transition-colors hover:bg-surface-raised"
      >
        <Download className="size-4" aria-hidden />
        Exporter
      </a>
    </div>
  );
}

/** Filtres rapides — ils écrivent les mêmes paramètres que les champs ci-dessus. */
export function QuickFilters({
  severity,
  from,
  to,
  presets,
}: {
  severity: string;
  from: string;
  to: string;
  presets: { key: string; label: string; from: string; to: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const push = useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      }
      next.delete('page');
      next.delete('evenement');
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [params, pathname, router],
  );

  const chip = (active: boolean, tone: 'critical' | 'warning' | 'brand') =>
    cn(
      'rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
      active
        ? {
            critical: 'border-critical/45 bg-critical-soft text-critical',
            warning: 'border-warning/45 bg-warning-soft text-warning',
            brand: 'border-brand/45 bg-brand-soft text-brand',
          }[tone]
        : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
    );

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => push({ severite: severity === 'critical' ? null : 'critical' })}
        className={chip(severity === 'critical', 'critical')}
      >
        Critiques
      </button>
      <button
        type="button"
        onClick={() => push({ severite: severity === 'major' ? null : 'major' })}
        className={chip(severity === 'major', 'warning')}
      >
        Majeurs
      </button>
      {presets.map((preset) => (
        <button
          key={preset.key}
          type="button"
          onClick={() => push({ du: preset.from, au: preset.to })}
          className={chip(from === preset.from && to === preset.to, 'brand')}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
