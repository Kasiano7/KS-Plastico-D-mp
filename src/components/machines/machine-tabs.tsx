'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

/**
 * Navigation interne de la fiche machine.
 *
 * Chaque onglet est une route réelle : la page est adressable, partageable et
 * rendue côté serveur. Le composant n'est client que pour connaître l'onglet
 * actif.
 */
export const MACHINE_TABS = [
  { segment: '', label: 'Vue d’ensemble' },
  // « Cycles » et « Consommation » sont devenus deux granularités de
  // « Production » : trois onglets décrivaient le même sujet à trois échelles.
  { segment: 'production', label: 'Production' },
  { segment: 'arrets', label: 'Arrêts' },
  { segment: 'qualite', label: 'Qualité' },
  { segment: 'documents', label: 'Documents' },
  { segment: 'maintenance', label: 'Maintenance' },
  { segment: 'historique', label: 'Historique' },
] as const;

export function MachineTabs({ machineId }: { machineId: string }) {
  const pathname = usePathname();
  const base = `/machines/${machineId}`;
  const activeSegment = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split('/')[0] : '';

  return (
    <nav
      aria-label="Sections de la fiche machine"
      className="mb-4 overflow-x-auto border-b border-line"
    >
      <ul className="flex min-w-max items-center gap-1">
        {MACHINE_TABS.map((tab) => {
          const active = tab.segment === activeSegment;
          return (
            <li key={tab.segment || 'overview'}>
              <Link
                href={tab.segment ? `${base}/${tab.segment}` : base}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-block border-b-2 px-3.5 py-3 text-[0.8125rem] font-medium transition-colors',
                  active
                    ? 'border-brand text-brand'
                    : 'border-transparent text-fg-muted hover:text-fg',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
