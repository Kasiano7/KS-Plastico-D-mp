'use client';

import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { DemoAccountSwitcher, type DemoAccountOption } from './demo-account-switcher';

export type DemoBarProps = {
  accounts: DemoAccountOption[];
  currentRole: string;
  embed: boolean;
};

/**
 * Bandeau permanent du mode démonstration.
 *
 * Dans l'application, le changement d'utilisateur se fait en haut à droite,
 * à la place du compte (`DemoAccountSwitcher` dans l'en-tête) : le bandeau se
 * contente alors de l'annoncer. Sur une page sans en-tête (« Accès refusé »),
 * `withSwitcher` place le sélecteur dans le bandeau lui-même.
 */
export function DemoBar({
  accounts,
  currentRole,
  embed,
  withSwitcher = false,
}: DemoBarProps & { withSwitcher?: boolean }) {
  return (
    <div
      role="region"
      aria-label="Mode démonstration"
      className={cn(
        'sticky top-0 z-40 flex shrink-0 items-center gap-3 bg-navy px-4 text-[0.75rem] text-white print:hidden lg:px-6',
        withSwitcher ? 'h-12' : 'h-9',
      )}
    >
      <p className="flex min-w-0 items-center gap-1.5 font-medium">
        <FlaskConical aria-hidden className="size-3.5 shrink-0 text-[#2f91ff]" />
        <span className="truncate">
          <span className="sm:hidden">Démo</span>
          <span className="hidden sm:inline">Démonstration</span> · données fictives
        </span>
      </p>

      {withSwitcher ? (
        <div className="ml-auto">
          <DemoAccountSwitcher accounts={accounts} currentRole={currentRole} embed={embed} tone="bar" />
        </div>
      ) : (
        <p className="ml-auto hidden truncate text-white/60 md:block">
          Changez d’utilisateur en haut à droite pour voir l’usine avec d’autres droits.
        </p>
      )}
    </div>
  );
}
