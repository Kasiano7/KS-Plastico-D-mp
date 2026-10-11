import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { cn } from '@/lib/cn';
import { formatFileSize } from '@/lib/format';
import { ESSENTIAL_CATEGORIES, type DocumentLibrarySummary } from '@/server/domain/documents';
import { DOCUMENT_CATEGORY_LABELS, DOCUMENT_CATEGORY_STYLE } from './document-category';

/**
 * Couverture documentaire du parc.
 *
 * Ce panneau ne compte pas des fichiers, il nomme des manques : les machines
 * dépourvues de notice ou de plan électrique sont celles qu'on dépannera sans
 * documentation. C'est la seule lecture qui déclenche une action.
 */
export function DocumentCoverage({ summary }: { summary: DocumentLibrarySummary }) {
  const incomplete = summary.coverage.filter((machine) => machine.missing.length > 0);
  const coveragePct =
    summary.machineCount === 0
      ? 0
      : Math.round((summary.fullyCoveredCount / summary.machineCount) * 100);

  return (
    /* `lg:h-full` + `overflow-hidden` : c'est la liste des manques qui défile,
       la carte ne s'étire pas par-dessus le panneau voisin. */
    <Panel className="min-h-0 min-w-0 overflow-hidden lg:h-full">
      <PanelHeader
        title="Couverture du parc"
        action={
          <span className="tnum text-[0.6875rem] font-semibold text-ink-muted">
            {summary.fullyCoveredCount}/{summary.machineCount}
          </span>
        }
      />

      <div className="px-3.5 pb-3">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'tnum text-[1.75rem] leading-none font-semibold',
              coveragePct >= 80 ? 'text-accent-green' : coveragePct >= 50 ? 'text-warning' : 'text-danger',
            )}
          >
            {coveragePct} %
          </span>
          <span className="text-[0.6875rem] text-ink-dim">
            des machines ont notice et plan électrique
          </span>
        </div>

        <div
          role="img"
          aria-label={`${coveragePct} % du parc documenté`}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-background-secondary"
        >
          <div
            className={cn(
              'h-full rounded-full',
              coveragePct >= 80 ? 'bg-accent-green' : coveragePct >= 50 ? 'bg-warning' : 'bg-danger',
            )}
            style={{ width: `${coveragePct}%` }}
          />
        </div>

        <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-dim">
          Documents jugés indispensables :{' '}
          {ESSENTIAL_CATEGORIES.map((category) => DOCUMENT_CATEGORY_LABELS[category]).join(' et ')}.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-edge px-3.5 py-2.5">
        {incomplete.length === 0 ? (
          <p className="flex items-center gap-2 py-3 text-[0.75rem] text-accent-green">
            <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={2} />
            Toutes les machines du parc sont documentées.
          </p>
        ) : (
          <ul className="space-y-2">
            {incomplete.map((machine) => (
              <li key={machine.machineId} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/machines/${machine.machineId}/documents`}
                    prefetch={false}
                    className="truncate text-[0.6875rem] font-medium text-ink hover:text-primary"
                  >
                    {machine.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {machine.missing.map((category) => (
                      <span
                        key={category}
                        className="rounded-chip border border-danger/30 bg-danger/10 px-1.5 py-px text-[0.5625rem] font-medium text-danger"
                      >
                        {DOCUMENT_CATEGORY_LABELS[category]} manquant
                      </span>
                    ))}
                  </p>
                </div>
                <span className="tnum shrink-0 text-[0.625rem] text-ink-dim">
                  {machine.documentCount} doc.
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-edge px-3.5 py-2.5">
        <h3 className="text-[0.5625rem] font-semibold tracking-[0.12em] text-ink-dim uppercase">
          Par catégorie
        </h3>
        <ul className="mt-2 space-y-1.5">
          {summary.categories.map((row) => (
            <li key={row.category} className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'inline-flex rounded-chip border px-1.5 py-px text-[0.625rem] font-medium',
                  DOCUMENT_CATEGORY_STYLE[row.category],
                )}
              >
                {DOCUMENT_CATEGORY_LABELS[row.category]}
              </span>
              <span className="tnum shrink-0 text-[0.625rem] text-ink-muted">
                {row.count}
                {row.count > 0 ? (
                  <span className="ml-1 text-ink-dim">{formatFileSize(row.sizeBytes)}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
