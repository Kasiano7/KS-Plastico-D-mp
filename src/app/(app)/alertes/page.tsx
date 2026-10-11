import type { Metadata } from 'next';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { listAlerts } from '@/server/services/alerts';
import { AlertCard } from '@/components/factory/alert-card';
import { RecentDecisions } from '@/components/factory/recent-decisions';
import { listRecentDecisions } from '@/server/services/decisions';
import { RunAlertEngineButton } from '@/components/factory/run-alert-engine-button';
import { Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { formatCents } from '@/lib/format';
import type { Severity } from '@/components/ui/severity';

export const metadata: Metadata = { title: 'Alertes' };
export const dynamic = 'force-dynamic';

const SEVERITY_FILTERS: { value: Severity | 'all'; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'critical', label: 'Critiques' },
  { value: 'warning', label: 'Attention' },
  { value: 'info', label: 'Information' },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ severite?: string }>;
}) {
  const user = await requirePermission('alerts:read');
  const { severite } = await searchParams;

  const canSeeFinancials = can(user.permissions, 'finance:read');
  const [alerts, decisions] = await Promise.all([listAlerts(), listRecentDecisions()]);

  const filtered =
    severite && severite !== 'all' ? alerts.filter((alert) => alert.severity === severite) : alerts;

  const totalImpact = alerts.reduce((total, alert) => total + alert.impactCents, 0);
  const counts = alerts.reduce<Record<string, number>>((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Centre d’alertes"
        description="Chaque alerte porte son problème, sa cause probable, ses conséquences, son impact et la recommandation associée."
        action={can(user.permissions, 'alerts:write') ? <RunAlertEngineButton /> : null}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {SEVERITY_FILTERS.map((filter) => {
          const isActive = (severite ?? 'all') === filter.value;
          const count = filter.value === 'all' ? alerts.length : (counts[filter.value] ?? 0);
          return (
            <a
              key={filter.value}
              href={`/alertes?severite=${filter.value}`}
              className={
                isActive
                  ? 'rounded-full border border-brand bg-brand-soft px-3 py-1.5 text-xs font-medium text-brand'
                  : 'rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong'
              }
            >
              {filter.label}
              <span className="ml-1.5 tabular opacity-70">{count}</span>
            </a>
          );
        })}

        {canSeeFinancials && totalImpact > 0 ? (
          <span className="ml-auto text-[0.8125rem] text-fg-muted">
            Impact cumulé estimé{' '}
            <span className="tabular font-semibold text-warning">{formatCents(totalImpact)}</span>
          </span>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-fg">Aucune alerte dans ce filtre.</p>
          <p className="mt-1 text-sm text-fg-muted">
            {alerts.length === 0
              ? 'L’usine ne remonte aucune anomalie détectée.'
              : 'Changez de filtre pour voir les autres alertes.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert, index) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              canDecide={can(user.permissions, 'recommendations:approve')}
              canWrite={can(user.permissions, 'alerts:write')}
              canSeeFinancials={canSeeFinancials}
              defaultOpen={index === 0}
            />
          ))}
        </div>
      )}

      {/*
        Le fil des décisions ferme la boucle du produit : après « l'IA
        recommande, l'humain décide », il montre ce que la décision a donné.
      */}
      <div className="mt-8">
        <RecentDecisions
          decisions={decisions.decisions}
          stats={decisions.stats}
          canSeeFinancials={canSeeFinancials}
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface-sunken px-4 py-3">
        <StatusBadge severity="info" size="sm">
          Principe
        </StatusBadge>
        <p className="text-[0.8125rem] text-fg-muted">
          L’IA recommande, l’humain décide. Aucune recommandation n’est appliquée sans validation
          explicite, et chaque décision est inscrite au journal d’audit.
        </p>
      </div>
    </div>
  );
}
