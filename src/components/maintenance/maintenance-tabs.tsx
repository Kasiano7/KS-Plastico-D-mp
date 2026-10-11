'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';
import {
  DEFAULT_MAINTENANCE_TAB,
  MAINTENANCE_TABS,
  resolveMaintenanceTab,
} from './maintenance-tab-config';

/**
 * Navigation interne de la maintenance.
 *
 * Chaque onglet est une vraie adresse (`?onglet=…`) : la vue est partageable,
 * elle survit à un rechargement et reste rendue côté serveur. Le composant
 * n'est client que pour savoir quel onglet est actif.
 */
export function MaintenanceTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolveMaintenanceTab(searchParams.get('onglet') ?? undefined);

  return (
    <nav aria-label="Sections de la maintenance" className="border-b border-edge">
      <ul className="flex min-w-max items-center gap-0.5 overflow-x-auto">
        {MAINTENANCE_TABS.map((tab) => {
          const isActive = tab.id === active;
          const href =
            tab.id === DEFAULT_MAINTENANCE_TAB ? pathname : `${pathname}?onglet=${tab.id}`;

          return (
            <li key={tab.id}>
              <Link
                href={href}
                prefetch={false}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-block border-b-2 px-3 py-2.5 text-[0.75rem] font-medium whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-ink-muted hover:text-ink',
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
