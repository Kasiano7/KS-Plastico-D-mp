import type { Metadata } from 'next';
import Link from 'next/link';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { DailyReportView } from '@/components/analytics/daily-report-view';
import { TrendsView } from '@/components/analytics/trends-view';
import { cn } from '@/lib/cn';

export const metadata: Metadata = { title: 'Analyse' };
export const dynamic = 'force-dynamic';

const VIEWS = [
  { id: 'tendances', label: 'Tendances', permission: 'analytics:read' },
  { id: 'rapport', label: 'Rapport du jour', permission: 'dashboard:read' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

/**
 * Analyse — tendances et rapport du jour.
 *
 * C'étaient deux pages qui répondaient à la même question avec les mêmes
 * sous-scores : « Analyse / KPI » montrait les courbes, « Rapport quotidien »
 * la synthèse imprimable. Deux portes vers un seul sujet, dont une n'était
 * même pas dans le menu.
 *
 * Les deux vues gardent leur propre permission : `analytics:read` pour les
 * tendances, `dashboard:read` pour le rapport. Un rôle qui n'a que la seconde
 * arrive directement sur le rapport.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const user = await requirePermission('dashboard:read');
  const { vue } = await searchParams;

  const canSeeTrends = can(user.permissions, 'analytics:read');
  const available = VIEWS.filter((view) => view.id !== 'tendances' || canSeeTrends);

  // Sans droit sur les tendances, le rapport devient la vue par défaut.
  const requested = available.some((view) => view.id === vue) ? (vue as ViewId) : null;
  const view: ViewId = requested ?? (canSeeTrends ? 'tendances' : 'rapport');

  return (
    <div className="mx-auto max-w-[1400px]">
      {available.length > 1 ? (
        <div
          role="group"
          aria-label="Vue"
          className="mb-4 inline-flex rounded-[var(--radius-control)] border border-line bg-surface-sunken p-0.5"
        >
          {available.map((item) => (
            <Link
              key={item.id}
              href={`/analyse?vue=${item.id}`}
              prefetch={false}
              scroll={false}
              aria-current={item.id === view ? 'true' : undefined}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
                item.id === view
                  ? 'bg-surface text-fg shadow-[var(--shadow-xs)]'
                  : 'text-fg-muted hover:text-fg',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}

      {view === 'rapport' ? <DailyReportView /> : <TrendsView />}
    </div>
  );
}
