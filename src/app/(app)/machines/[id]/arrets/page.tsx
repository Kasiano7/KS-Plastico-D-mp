import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePermission } from '@/server/auth/session';
import { can, canAny } from '@/server/domain/permissions';
import { getMachineDetail } from '@/server/services/machines';
import { Timeline } from '@/components/factory/timeline';
import { IncidentForm, MachineStatusForm } from '@/components/factory/machine-controls';
import { Panel } from '@/components/machines/overview-cards';
import { StatusBadge } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCents, formatDate, formatDuration } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';

export const metadata: Metadata = { title: 'Arrêts machine' };
export const dynamic = 'force-dynamic';

const EVENT_LABELS: Record<string, string> = {
  production_start: 'Production',
  production_end: 'Fin de production',
  stop: 'Arrêt',
  setup: 'Réglage',
  mold_change: 'Changement de moule',
  fault: 'Défaut',
  maintenance: 'Maintenance',
  restart: 'Remise en service',
};

export default async function MachineStopsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('machines:read');
  const machine = await getMachineDetail((await params).id);
  if (!machine) notFound();

  const canSeeFinancials = can(user.permissions, 'finance:read');
  const canWrite = can(user.permissions, 'machines:write');
  // Aligné sur `declareIncidentAction`, qui accepte l'une ou l'autre permission.
  const canDeclareIncident = canAny(user.permissions, ['incidents:declare', 'maintenance:write']);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <div className="space-y-4">
        <Panel
          title="Journée de la machine"
          hint="Reconstitution minute par minute à partir des événements enregistrés"
          bodyClassName="px-0 pb-0"
        >
          <Timeline
            entries={machine.timeline.map((entry) => ({
              id: entry.id,
              label: EVENT_LABELS[entry.type] ?? entry.type,
              severity: entry.severity,
              startedAt: entry.startedAt,
              endedAt: entry.endedAt,
              durationMinutes: entry.durationMinutes,
              detail: entry.reason,
            }))}
          />
        </Panel>

        <Panel
          title="Mémoire de la machine"
          hint="Incidents passés, causes racines et solutions appliquées"
          action={
            machine.incidentsTruncated ? (
              <Link
                href={`/machines/${machine.id}/historique`}
                prefetch={false}
                className="text-[0.8125rem] font-medium text-brand hover:underline"
              >
                Voir tout l’historique
              </Link>
            ) : null
          }
        >
          {machine.incidents.length === 0 ? (
            <p className="text-[0.8125rem] text-fg-muted">Aucun incident enregistré sur cette presse.</p>
          ) : (
            <ul className="space-y-3">
              {machine.incidents.map((incident) => (
                <li key={incident.id} className="rounded-xl border border-line bg-surface-sunken p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge severity={incident.severity} size="sm">
                      {incident.reference}
                    </StatusBadge>
                    <span className="text-[0.875rem] font-medium text-fg">{incident.title}</span>
                    <span className="ml-auto text-xs text-fg-subtle">{formatDate(incident.occurredAt)}</span>
                  </div>
                  <p className="mt-2 text-[0.8125rem] text-fg-muted">{incident.symptom}</p>
                  {incident.rootCause ? (
                    <p className="mt-1.5 text-[0.8125rem] text-fg">
                      <span className="font-medium">Cause : </span>
                      {incident.rootCause}
                    </p>
                  ) : null}
                  {incident.resolution ? (
                    <p className="mt-1 text-[0.8125rem] text-normal">
                      <span className="font-medium">Solution : </span>
                      {incident.resolution}
                    </p>
                  ) : null}
                  {incident.downtimeMinutes > 0 ? (
                    <p className="mt-2 text-xs text-fg-subtle">
                      {formatDuration(incident.downtimeMinutes)} d’arrêt
                      {canSeeFinancials && incident.estimatedCostCents > 0
                        ? ` · impact estimé ${formatCents(incident.estimatedCostCents)}`
                        : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <div className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
          <p className="text-[0.8125rem] text-fg-muted">Arrêts cumulés du jour</p>
          <p
            className={cn(
              'tabular mt-2 text-[1.625rem] leading-none font-semibold',
              machine.downtimeMinutes > 0 ? 'text-warning' : 'text-normal',
            )}
          >
            {machine.downtimeMinutes > 0 ? formatDuration(machine.downtimeMinutes) : '0 min'}
          </p>
          <p className="mt-2 text-xs text-fg-subtle">
            sur {formatDuration(machine.plannedMinutes)} de temps journalisé
          </p>
          {canSeeFinancials && machine.impact ? (
            <p className="mt-3 border-t border-line pt-3 text-[0.8125rem] text-fg-muted">
              Impact estimé :{' '}
              <span className="font-semibold text-critical">{formatCents(machine.impact.totalCents)}</span>
            </p>
          ) : null}
        </div>

        {canWrite ? (
          <section
            id="changer-etat"
            className={cn(styles.panel, 'scroll-mt-24 rounded-2xl border border-line')}
          >
            <header className="px-5 pt-4 pb-2">
              <h2 className="text-[1.0625rem] font-semibold text-fg">Changer l’état</h2>
              <p className="mt-0.5 text-[0.8125rem] text-fg-muted">La modification est journalisée</p>
            </header>
            <MachineStatusForm machineId={machine.id} currentStatus={machine.status} />
          </section>
        ) : null}

        {canDeclareIncident ? (
          <section
            id="declarer-incident"
            className={cn(styles.panel, 'scroll-mt-24 rounded-2xl border border-line')}
          >
            <header className="px-5 pt-4 pb-2">
              <h2 className="text-[1.0625rem] font-semibold text-fg">Déclarer un incident</h2>
              <p className="mt-0.5 text-[0.8125rem] text-fg-muted">
                Alimente la mémoire de l’usine et le centre d’alertes
              </p>
            </header>
            <IncidentForm machineId={machine.id} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
