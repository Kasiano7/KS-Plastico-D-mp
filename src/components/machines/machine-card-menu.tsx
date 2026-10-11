'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Gauge, History, MoreHorizontal, Settings2, Wrench } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Menu contextuel d'une carte machine.
 *
 * Il n'ouvre que des écrans existants : aucune action n'est simulée. Le menu
 * se ferme au clic extérieur et à la touche Échap, et le bouton porte l'état
 * ARIA attendu d'un menu.
 */
const ENTRIES = [
  { key: 'fiche', label: 'Ouvrir la fiche', icon: Gauge, href: (id: string) => `/machines/${id}` },
  {
    key: 'historique',
    label: 'Historique des alertes',
    icon: History,
    href: (id: string) => `/machines/${id}/historique`,
  },
  {
    key: 'arrets',
    label: 'Arrêts et état machine',
    icon: Settings2,
    href: (id: string) => `/machines/${id}/arrets`,
  },
  {
    key: 'maintenance',
    label: 'Plan de maintenance',
    icon: Wrench,
    href: (id: string) => `/machines/${id}/maintenance`,
  },
] as const;

export function MachineCardMenu({
  machineId,
  machineName,
}: {
  machineId: string;
  machineName: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative z-20 justify-self-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'grid size-9 place-items-center rounded-lg border border-line text-fg-muted transition-colors',
          'hover:border-line-strong hover:bg-surface-raised hover:text-fg',
          open && 'border-brand/40 bg-brand-soft text-brand',
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
        <span className="sr-only">Actions pour {machineName}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Actions pour ${machineName}`}
          className="absolute right-0 bottom-full z-30 mb-2 w-56 overflow-hidden rounded-xl border border-line-strong bg-surface-raised py-1 shadow-[var(--shadow-float)]"
        >
          {ENTRIES.map((entry) => (
            <Link
              key={entry.key}
              role="menuitem"
              href={entry.href(machineId)}
              prefetch={false}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-[0.8125rem] text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
            >
              <entry.icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              {entry.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
