'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { NAV_ITEMS } from '@/config/navigation';
import { cn } from '@/lib/cn';
import { QrScannerDialog } from './qr-scanner-dialog';

/**
 * Les QR de palette encodent `{p, l, q}` (code, lot, quantité — voir
 * `app/(app)/poste/page.tsx`). Un QR non reconnu retombe sur son texte brut :
 * la recherche fonctionne aussi pour un code tapé à la main.
 */
function extractSearchTerm(scanned: string): string {
  try {
    const parsed = JSON.parse(scanned) as { p?: unknown };
    if (typeof parsed.p === 'string' && parsed.p.length > 0) return parsed.p;
  } catch {
    // Pas un JSON de palette KS Plastico Demo : on cherche le texte scanné tel quel.
  }
  return scanned;
}

type SearchResult = {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  subtitle: string;
  href: string;
};

/**
 * Palette de commandes accessible au clavier (Ctrl+K / ⌘K) — §37.
 *
 * Le composant est monté à l'ouverture et démonté à la fermeture : son état
 * repart donc toujours propre, sans effet de réinitialisation.
 */
export function CommandPalette({
  onClose,
  allowedHrefs,
}: {
  onClose: () => void;
  allowedHrefs: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [fetched, setFetched] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim();

  const pages = useMemo(() => {
    const allowed = new Set(allowedHrefs);
    const needle = term.toLowerCase();
    return NAV_ITEMS.filter(
      (item) => allowed.has(item.href) && (needle === '' || item.label.toLowerCase().includes(needle)),
    ).map((item) => ({
      id: item.href,
      type: 'page',
      typeLabel: 'Page',
      title: item.label,
      subtitle: item.href,
      href: item.href,
    }));
  }, [allowedHrefs, term]);

  // Les résultats distants ne valent que pour la requête en cours : au lieu de
  // les effacer depuis un effet, on les ignore tant que la saisie est trop courte.
  const results = term.length < 2 ? [] : fetched;
  const entries = [...pages, ...results];
  const safeIndex = entries.length === 0 ? 0 : Math.min(activeIndex, entries.length - 1);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/recherche?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const payload = await response.json();
        setFetched(payload.results ?? []);
      } catch {
        // Requête annulée par une frappe suivante : rien à signaler.
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <button type="button" aria-label="Fermer la recherche" onClick={onClose} className="fixed inset-0 bg-overlay" />

      <div
        role="dialog"
        aria-label="Recherche globale"
        className="animate-fade-up relative w-full max-w-xl overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-fg-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(Math.min(safeIndex + 1, entries.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(Math.max(safeIndex - 1, 0));
              } else if (event.key === 'Enter' && entries[safeIndex]) {
                event.preventDefault();
                go(entries[safeIndex].href);
              } else if (event.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Rechercher une commande, une pièce, une machine, un employé…"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
          />
          {loading ? <Loader2 className="size-3.5 animate-spin text-fg-subtle" /> : null}
          <QrScannerDialog
            label="Scanner un QR de palette"
            iconOnly
            onScan={(scanned) => {
              setQuery(extractSearchTerm(scanned));
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.625rem] text-fg-subtle sm:block">
            Échap
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto py-2">
          {entries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-subtle">
              {term.length < 2 ? 'Saisissez au moins deux caractères.' : 'Aucun résultat.'}
            </p>
          ) : (
            <ul>
              {entries.map((entry, index) => (
                <li key={`${entry.type}-${entry.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(entry.href)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left',
                      index === safeIndex ? 'bg-brand-soft' : 'hover:bg-surface-sunken',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-medium text-fg">
                        {entry.title}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">{entry.subtitle}</span>
                    </span>
                    <span className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[0.625rem] tracking-wide text-fg-subtle uppercase">
                      {entry.typeLabel}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
