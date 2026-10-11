import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SEVERITY_SYMBOLS, SEVERITY_TEXT } from '@/components/ui/severity';
import { selectAttention, type AttentionItem } from '@/server/domain/attention';
import { cn } from '@/lib/cn';

/**
 * Bande « Ce qui demande votre attention ».
 *
 * Ouvre une page de liste par les deux ou trois lignes qui posent problème,
 * avant le tableau complet. La sévérité est calculée par le domaine depuis le
 * début ; elle n'était simplement jamais mise en avant, et l'utilisateur
 * devait lire vingt lignes pour trouver les deux qui comptent.
 *
 * Quand il n'y a rien à signaler, le composant ne rend rien : une bande vide
 * répétée sur chaque page redevient du bruit.
 */
export function AttentionBar({
  items,
  limit,
  className,
}: {
  items: readonly AttentionItem[];
  limit?: number;
  className?: string;
}) {
  const retained = selectAttention(items, limit);
  if (retained.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-title"
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface',
        className,
      )}
    >
      <h2
        id="attention-title"
        className="border-b border-line px-4 py-2.5 text-[0.6875rem] font-semibold tracking-[0.1em] text-fg-muted uppercase"
      >
        Ce qui demande votre attention
      </h2>

      <ul className="divide-y divide-line">
        {retained.map((item) => {
          const row = (
            <>
              {/* Le symbole double la couleur : l'information ne repose
                  jamais sur la seule teinte. */}
              <span
                aria-hidden
                className={cn('mt-px shrink-0 text-[0.625rem]', SEVERITY_TEXT[item.severity])}
              >
                {SEVERITY_SYMBOLS[item.severity]}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-medium text-fg">{item.title}</span>
                {item.detail ? (
                  <span className="mt-0.5 block text-[0.8125rem] text-fg-muted">{item.detail}</span>
                ) : null}
              </span>

              {item.href ? (
                <ChevronRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                />
              ) : null}
            </>
          );

          return (
            <li key={item.id}>
              {item.href ? (
                <Link
                  href={item.href}
                  prefetch={false}
                  className="group flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-4 py-2.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
