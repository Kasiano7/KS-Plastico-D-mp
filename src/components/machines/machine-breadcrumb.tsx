'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { MACHINE_TABS } from './machine-tabs';

/**
 * Fil d'Ariane de la fiche machine. Le dernier maillon suit l'onglet ouvert :
 * il se déduit de l'URL, pas d'un état passé de page en page.
 */
export function MachineBreadcrumb({
  machineId,
  machineName,
}: {
  machineId: string;
  machineName: string;
}) {
  const pathname = usePathname();
  const base = `/machines/${machineId}`;
  const segment = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1).split('/')[0] : '';
  const tail = MACHINE_TABS.find((tab) => tab.segment === segment && tab.segment !== '');

  return (
    <nav aria-label="Fil d’Ariane" className="mb-4 flex items-center gap-1.5 text-[0.8125rem]">
      <Link href="/machines" prefetch={false} className="text-fg-muted hover:text-fg">
        Parc machines
      </Link>
      <ChevronRight className="size-3.5 text-fg-subtle" aria-hidden />
      {tail ? (
        <>
          <Link href={base} prefetch={false} className="text-fg-muted hover:text-fg">
            {machineName}
          </Link>
          <ChevronRight className="size-3.5 text-fg-subtle" aria-hidden />
          <span className="font-medium text-fg">{tail.label}</span>
        </>
      ) : (
        <span className="font-medium text-fg">{machineName}</span>
      )}
    </nav>
  );
}
