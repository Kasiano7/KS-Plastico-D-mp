import Link from 'next/link';
import { ICONS } from '@/components/ui/icon';
import { Panel } from '@/components/ui/panel';
import { TONE_SURFACE } from '@/components/ui/tone';
import { cn } from '@/lib/cn';
import type { QuickAction } from '@/types/dashboard';

/**
 * Accès rapides : les quatre gestes du quotidien, sur une seule ligne.
 * Une bande plutôt que des cartes — ce sont des raccourcis, pas des données.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <Panel className="flex-row items-stretch overflow-hidden">
      <div className="flex shrink-0 items-center border-r border-edge bg-background-secondary/60 px-3.5">
        <span className="text-[0.75rem] font-semibold whitespace-nowrap text-ink">Accès rapides</span>
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 divide-edge sm:grid-cols-4 sm:divide-x">
        {actions.map((action) => {
          const Icon = ICONS[action.icon];

          return (
            <Link
              key={action.id}
              href={action.href}
              prefetch={false}
              className="flex min-w-0 items-center gap-2 px-2 py-2.5 transition-colors hover:bg-card-hover"
            >
              <span
                className={cn(
                  'grid size-[18px] shrink-0 place-items-center rounded-md',
                  TONE_SURFACE[action.tone],
                )}
              >
                <Icon className="size-[11px]" strokeWidth={2} />
              </span>
              <span className="truncate text-[0.625rem] font-medium text-ink-muted">
                {action.label}
              </span>
            </Link>
          );
        })}
      </div>
    </Panel>
  );
}
