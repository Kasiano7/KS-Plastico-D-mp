'use client';

import { FlaskConical } from 'lucide-react';

export type DemoBarProps = {
  roles: { key: string; label: string }[];
  currentRole: string;
  embed: boolean;
};

/**
 * Bandeau permanent du mode démonstration.
 *
 * Le changement de point de vue est un simple formulaire GET vers `/demo` :
 * le proxy mémorise le rôle (cookie partitionné, ou URL en secours) et ouvre
 * l'accueil de ce rôle — avec ses droits réels, relus en base.
 */
export function DemoBar({ roles, currentRole, embed }: DemoBarProps) {
  return (
    <div
      role="region"
      aria-label="Mode démonstration"
      className="sticky top-0 z-40 flex h-9 shrink-0 items-center gap-3 bg-navy px-4 text-[0.75rem] text-white print:hidden lg:px-6"
    >
      <p className="flex min-w-0 items-center gap-1.5 font-medium">
        <FlaskConical aria-hidden className="size-3.5 shrink-0 text-[#2f91ff]" />
        <span className="truncate">
          <span className="sm:hidden">Démo</span>
          <span className="hidden sm:inline">Démonstration</span> · données fictives
        </span>
      </p>

      <form action="/demo" method="get" className="ml-auto flex items-center gap-2">
        {embed ? <input type="hidden" name="embed" value="1" /> : null}
        <label htmlFor="demo-role" className="hidden text-white/70 sm:inline">
          Point de vue
        </label>
        <select
          id="demo-role"
          name="role"
          defaultValue={currentRole}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-7 max-w-[45vw] rounded-[var(--radius-control)] border border-white/20 bg-white/10 px-2 text-[0.75rem] text-white focus:outline-2 focus:outline-[#2f91ff]"
        >
          {roles.map((role) => (
            <option key={role.key} value={role.key} className="text-fg">
              {role.label}
            </option>
          ))}
        </select>
        <noscript>
          <button type="submit" className="rounded border border-white/30 px-2 py-0.5">
            Changer
          </button>
        </noscript>
      </form>
    </div>
  );
}
