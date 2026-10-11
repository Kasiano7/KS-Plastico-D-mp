'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  EVENT_IMPACT_LABELS,
  EVENT_SEVERITY_LABELS,
  EVENT_TYPE_LABELS,
  formatEventDuration,
  paginationRange,
  type MachineEventRecord,
  type Page,
} from '@/server/domain/machine-events';
import { SEVERITY_TEXT } from '@/components/ui/severity';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { EVENT_SEVERITY_CHIP, EVENT_TYPE_ICON, EVENT_TYPE_TEXT } from './event-presentation';

/**
 * Tableau de l'historique.
 *
 * Une ligne entière ouvre le tiroir de détail. Le lien réel se trouve sur la
 * chevron de droite : la ligne cliquable n'est qu'un raccourci à la souris,
 * la navigation clavier passe par ce lien.
 */

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Europe/Paris',
});

function formatStamp(date: Date): string {
  return dateTimeFormat.format(date).replace(',', '');
}

export function EventTable({
  page,
  selectedId,
}: {
  page: Page<MachineEventRecord>;
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = useCallback(
    (eventId: string) => {
      const next = new URLSearchParams(params.toString());
      next.set('evenement', eventId);
      return `${pathname}?${next.toString()}`;
    },
    [params, pathname],
  );

  const hrefForPage = useCallback(
    (value: number) => {
      const next = new URLSearchParams(params.toString());
      if (value <= 1) next.delete('page');
      else next.set('page', String(value));
      next.delete('evenement');
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [params, pathname],
  );

  const setPageSize = useCallback(
    (value: string) => {
      const next = new URLSearchParams(params.toString());
      next.set('taille', value);
      next.delete('page');
      next.delete('evenement');
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const range = paginationRange(page.page, page.pageCount);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              {['Date & heure', 'Type', 'Sévérité', 'Code', 'Événement / Description', 'Durée', 'Impact', 'Opérateur'].map(
                (label) => (
                  <th
                    key={label}
                    scope="col"
                    className="border-y border-line px-4 py-3 text-left text-[0.8125rem] font-medium whitespace-nowrap text-fg-muted"
                  >
                    {label}
                  </th>
                ),
              )}
              <th scope="col" className="border-y border-line px-4 py-3">
                <span className="sr-only">Détail</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-fg-muted">
                  Aucun événement ne correspond à ces critères.
                </td>
              </tr>
            ) : (
              page.items.map((event) => {
                const Icon = EVENT_TYPE_ICON[event.type];
                const selected = event.id === selectedId;

                return (
                  <tr
                    key={event.id}
                    onClick={() => router.replace(hrefFor(event.id), { scroll: false })}
                    className={cn(
                      'cursor-pointer border-b border-line transition-colors hover:bg-surface-raised',
                      selected && 'bg-surface-raised',
                    )}
                  >
                    <td className="tabular px-4 py-3 whitespace-nowrap text-fg">{formatStamp(event.occurredAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-2 text-fg-muted">
                        <Icon className={cn('size-4 shrink-0', EVENT_TYPE_TEXT[event.type])} aria-hidden />
                        {EVENT_TYPE_LABELS[event.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium',
                          EVENT_SEVERITY_CHIP[event.severity],
                        )}
                      >
                        {EVENT_SEVERITY_LABELS[event.severity]}
                      </span>
                    </td>
                    <td className="tabular px-4 py-3 whitespace-nowrap text-fg-muted">{event.code}</td>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-fg">{event.title}</span>
                      <span className="mt-0.5 block text-fg-muted">{event.description}</span>
                    </td>
                    <td
                      className={cn(
                        'tabular px-4 py-3 whitespace-nowrap',
                        event.durationSeconds ? SEVERITY_TEXT.critical : 'text-fg-subtle',
                      )}
                    >
                      {formatEventDuration(event.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-fg-muted">
                      {EVENT_IMPACT_LABELS[event.impact]}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="flex items-center gap-2 text-fg-muted">
                        <span
                          aria-hidden
                          className="grid size-6 shrink-0 place-items-center rounded-full bg-navy-soft text-[0.625rem] font-semibold text-fg"
                        >
                          {initials(event.operator ?? event.shift ?? '—')}
                        </span>
                        {event.operator ?? event.shift ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={hrefFor(event.id)}
                        scroll={false}
                        replace
                        aria-label={`Détail de l’événement ${event.code} du ${formatStamp(event.occurredAt)}`}
                        className="inline-grid size-7 place-items-center rounded-md border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <label className="flex items-center gap-2 text-[0.8125rem] text-fg-muted">
          Afficher
          <select
            value={String(page.pageSize)}
            onChange={(event) => setPageSize(event.target.value)}
            className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[0.8125rem] text-fg outline-none"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          événements par page
        </label>

        <p className="tabular text-[0.8125rem] text-fg-muted">
          {page.firstIndex} à {page.lastIndex} sur {page.total} événements
        </p>

        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PagerLink
            href={hrefForPage(page.page - 1)}
            disabled={page.page <= 1}
            label="Page précédente"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </PagerLink>

          {range.map((value, index) =>
            value === null ? (
              <span key={`gap-${index}`} className="px-1 text-fg-subtle" aria-hidden>
                …
              </span>
            ) : (
              <Link
                key={value}
                href={hrefForPage(value)}
                scroll={false}
                aria-current={value === page.page ? 'page' : undefined}
                className={cn(
                  'tabular grid size-8 place-items-center rounded-lg border text-[0.8125rem] transition-colors',
                  value === page.page
                    ? 'border-brand/45 bg-brand-soft font-semibold text-brand'
                    : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {value}
              </Link>
            ),
          )}

          <PagerLink
            href={hrefForPage(page.page + 1)}
            disabled={page.page >= page.pageCount}
            label="Page suivante"
          >
            <ChevronRight className="size-4" aria-hidden />
          </PagerLink>
        </nav>
      </div>
    </>
  );
}

function PagerLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        aria-label={label}
        className="grid size-8 place-items-center rounded-lg border border-line text-fg-subtle opacity-45"
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      scroll={false}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
    >
      {children}
    </Link>
  );
}
