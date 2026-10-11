'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export type DemoAccountOption = { key: string; fullName: string; roleLabel: string };

/**
 * Changement d'utilisateur de la démonstration, à l'emplacement habituel du
 * compte (en haut à droite) : nom + fonction de chaque personne de l'usine.
 *
 * Chaque entrée est un simple lien vers `/demo?role=…` : le proxy mémorise le
 * choix et ouvre l'accueil de ce compte, avec ses droits réels. Aucun mot de
 * passe, aucune session.
 */
export function DemoAccountSwitcher({
  accounts,
  currentRole,
  embed,
  tone = 'header',
}: {
  accounts: DemoAccountOption[];
  currentRole: string;
  embed: boolean;
  /** `header` : barre supérieure de l'application ; `bar` : bandeau sombre (page sans en-tête). */
  tone?: 'header' | 'bar';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = accounts.find((account) => account.key === currentRole) ?? accounts[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Utilisateur : ${current.fullName}, ${current.roleLabel}. Changer d'utilisateur`}
        className={cn(
          'flex items-center gap-2 rounded-[var(--radius-control)] px-1.5 py-1 transition-colors',
          tone === 'header' ? 'hover:bg-surface-sunken' : 'hover:bg-white/10',
        )}
      >
        <span className={cn('hidden text-right xl:block', tone === 'bar' && 'sm:block')}>
          <span
            className={cn(
              'block text-[0.8125rem] leading-tight font-medium',
              tone === 'header' ? 'text-fg' : 'text-white',
            )}
          >
            {current.fullName}
          </span>
          <span
            className={cn(
              'block text-[0.6875rem] leading-tight',
              tone === 'header' ? 'text-fg-subtle' : 'text-white/60',
            )}
          >
            {current.roleLabel}
          </span>
        </span>
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-navy text-[0.6875rem] font-semibold text-white ring-1 ring-white/15"
        >
          {initials(current.fullName)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 transition-transform',
            open && 'rotate-180',
            tone === 'header' ? 'text-fg-subtle' : 'text-white/70',
          )}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Changer d'utilisateur"
          className="absolute top-full right-0 z-50 mt-2 w-72 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-fg shadow-[var(--shadow-card)]"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[0.8125rem] font-semibold">Changer d’utilisateur</p>
            <p className="mt-0.5 text-[0.75rem] text-fg-subtle">
              Démonstration · chaque personne voit l’usine avec ses propres droits.
            </p>
          </div>
          <ul className="max-h-[60vh] overflow-y-auto py-1">
            {accounts.map((account) => {
              const selected = account.key === current.key;
              return (
                <li key={account.key}>
                  <a
                    role="menuitem"
                    href={`/demo?role=${account.key}${embed ? '&embed=1' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none',
                      selected && 'bg-surface-sunken',
                    )}
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-[0.6875rem] font-semibold text-white"
                    >
                      {initials(account.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-medium">{account.fullName}</span>
                      <span className="block truncate text-[0.75rem] text-fg-subtle">{account.roleLabel}</span>
                    </span>
                    {selected ? <Check aria-hidden className="size-4 shrink-0 text-[#2f91ff]" /> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
