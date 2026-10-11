import Link from 'next/link';
import { AlertTriangle, CalendarDays, Clock3, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getMaintenanceDashboard } from '@/server/services/maintenance';
import {
  CompleteMaintenanceButton,
  ResolveIncidentForm,
  ScheduleMaintenanceForm,
} from '@/components/factory/maintenance-forms';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatCents, formatDate, formatDateTime, formatDuration, formatPercent } from '@/lib/format';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const RECURRENCE_LABELS: Record<string, string> = {
  none: 'Ponctuelle',
  monthly: 'Mensuelle',
  quarterly: 'Trimestrielle',
  semiannual: 'Semestrielle',
  annual: 'Annuelle',
};

function monthKey(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parisDayKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function buildCalendar(year: number, monthIndex: number) {
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - mondayOffset * 86_400_000);
  return Array.from({ length: 42 }, (_, index) =>
    new Date(start.getTime() + index * 86_400_000),
  );
}

function taskSeverity(status: string, scheduledAt: Date, now: Date) {
  if (status === 'completed') return 'normal' as const;
  if (scheduledAt < now) return 'critical' as const;
  return 'info' as const;
}

function taskStatus(status: string, scheduledAt: Date, now: Date) {
  if (status === 'completed') return 'Terminée';
  if (status === 'cancelled') return 'Annulée';
  if (scheduledAt < now) return 'En retard';
  return 'Planifiée';
}

/**
 * Sections affichables du bloc machines.
 *
 * Chaque onglet n'en demande que ce qui repond a SA question. Afficher les six
 * partout redonnait a chaque onglet l'ecran fourre-tout qu'on cherchait a
 * supprimer.
 */
export type MachineMaintenanceSection =
  | 'incidents'
  | 'pareto'
  | 'calendar'
  | 'tasks'
  | 'memory';

const ALL_SECTIONS: MachineMaintenanceSection[] = [
  'incidents',
  'pareto',
  'calendar',
  'tasks',
  'memory',
];

/**
 * Maintenance machines adossee a la base — conservee integralement.
 *
 * Ce bloc porte les seules actions REELLES de la maintenance : planifier une
 * preventive, resoudre un arret brutal, cloturer une intervention. Il alimente
 * les onglets Curatif, Preventif, Calendrier et Historique pendant que la vue
 * d'ensemble GMAO reste sur donnees de maquette.
 */
export async function MachineMaintenanceLegacy({
  monthParam,
  focusedIncident,
  sections = ALL_SECTIONS,
}: {
  monthParam?: string;
  focusedIncident?: string;
  /** Sections a rendre, dans l'ordre fixe du composant. */
  sections?: MachineMaintenanceSection[];
}) {
  const shows = (section: MachineMaintenanceSection) => sections.includes(section);
  const user = await requirePermission('maintenance:read');
  const dashboard = await getMaintenanceDashboard(monthParam);
  const canWrite = can(user.permissions, 'maintenance:write');
  const canSeeFinancials = can(user.permissions, 'finance:read');
  const calendarDays = buildCalendar(dashboard.month.year, dashboard.month.monthIndex);
  const monthTitle = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(Date.UTC(dashboard.month.year, dashboard.month.monthIndex, 1, 12)));
  const previousMonth = monthKey(dashboard.month.year, dashboard.month.monthIndex - 1);
  const nextMonth = monthKey(dashboard.month.year, dashboard.month.monthIndex + 1);
  const tasksByDay = new Map<string, typeof dashboard.tasks>();
  for (const task of dashboard.tasks) {
    const key = parisDayKey(task.task.scheduledAt);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }
  const activeCauseCount = dashboard.pareto.findIndex((cause) => cause.cumulativePct >= 80) + 1;
  const availableStaff = dashboard.staff.filter((person) => person.available);

  return (
    <div className="min-w-0">
      {canWrite && (shows('tasks') || shows('calendar')) ? (
        <div className="mb-4 flex justify-end">
          <ScheduleMaintenanceForm
            machines={dashboard.machines.map((machine) => ({ id: machine.id, label: `${machine.name} · ${machine.code}` }))}
            skills={dashboard.skills.map((skill) => ({ id: skill.id, label: skill.name }))}
            staff={dashboard.staff.map((person) => ({ id: person.employeeId, label: `${person.fullName} · ${person.skillName} N${person.skillLevel}` }))}
          />
        </div>
      ) : null}

      {shows('incidents') ? (
      <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={AlertTriangle} label="Pannes à traiter" value={String(dashboard.openIncidents.length)} detail="Arrêts ouverts ou en diagnostic" tone={dashboard.openIncidents.length > 0 ? 'critical' : 'normal'} />
        <KpiCard icon={Clock3} label="Arrêts cumulés · 12 mois" value={formatDuration(dashboard.totalDowntime)} detail={`${dashboard.incidents.length} incident(s) mémorisé(s)`} tone="warning" />
        <KpiCard icon={ShieldCheck} label="Causes couvrant 80 %" value={String(activeCauseCount || 0)} detail="Priorités issues du Pareto" tone="info" />
        <KpiCard icon={CalendarDays} label="Préventifs à venir" value={String(dashboard.upcomingTasks.length)} detail="Interventions non terminées" tone="normal" />
      </div>

      <div className="mb-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-9">
          <CardHeader
            title="Arrêts brutaux à traiter"
            subtitle="Le diagnostic enregistré ici alimente automatiquement la mémoire et le Pareto"
          />
          {dashboard.openIncidents.length === 0 ? (
            <div className="px-5 pb-5">
              <p className="rounded-[var(--radius-control)] bg-normal/10 p-4 text-sm text-normal">
                Aucun incident machine en attente de traitement.
              </p>
            </div>
          ) : (
            <div className="space-y-3 px-5 pb-5">
              {dashboard.openIncidents.map(({ incident, machineName, workshopName, productionOrderNumber }) => {
                const liveDowntime = incident.downtimeMinutes || Math.max(Math.round((dashboard.now.getTime() - incident.occurredAt.getTime()) / 60_000), 0);
                return (
                  <article
                    key={incident.id}
                    className={cn(
                      'rounded-[var(--radius-control)] border border-line p-4',
                      focusedIncident === incident.id && 'border-brand ring-2 ring-brand/20',
                    )}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge severity={incident.severity}>{incident.reference}</StatusBadge>
                          <Badge>{incident.status === 'investigating' ? 'Diagnostic en cours' : 'Ouvert'}</Badge>
                          <span className="text-xs text-fg-subtle">{formatDateTime(incident.occurredAt)}</span>
                        </div>
                        <h3 className="mt-2 font-semibold text-fg">{incident.title}</h3>
                        <p className="mt-1 text-sm text-fg-muted">{incident.symptom}</p>
                        <p className="mt-2 text-xs text-fg-subtle">
                          {machineName ?? 'Machine non renseignée'} · {workshopName ?? 'Atelier non renseigné'}
                          {productionOrderNumber ? ` · Planning ${productionOrderNumber}` : ' · Aucun OF rattaché'}
                          {` · ${formatDuration(liveDowntime)} d’arrêt`}
                        </p>
                      </div>
                      {incident.machineId ? (
                        <ButtonLink href={`/machines/${incident.machineId}`} variant="ghost" size="sm">Voir la machine</ButtonLink>
                      ) : null}
                      {canWrite ? <ResolveIncidentForm incidentId={incident.id} defaultDowntime={liveDowntime} defaultTags={incident.tags?.join(', ') ?? ''} /> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader title="Compétences disponibles" subtitle="Équipe active et absences prises en compte" />
          <div className="space-y-3 px-5 pb-5">
            {availableStaff.length > 0 ? availableStaff.map((person) => (
              <div key={`${person.employeeId}-${person.skillId}`} className="flex items-start gap-3 rounded-[var(--radius-control)] bg-surface-sunken p-3">
                <UserRoundCheck className="mt-0.5 size-4 shrink-0 text-normal" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{person.fullName}</p>
                  <p className="text-xs text-fg-muted">{person.skillName} · niveau {person.skillLevel}/4</p>
                </div>
              </div>
            )) : (
              <p className="rounded-[var(--radius-control)] bg-critical/10 p-3 text-sm text-critical">
                Aucun technicien compétent disponible sur l’équipe actuelle.
              </p>
            )}
            <p className="border-t border-line pt-3 text-xs leading-relaxed text-fg-subtle">
              Lors d’un arrêt brutal, cette disponibilité et le planning de production sont joints à l’alerte envoyée uniquement aux responsables production et maintenance.
            </p>
          </div>
        </Card>
      </div>
      </>
      ) : null}

      {shows('pareto') ? (
      <Card className="mb-5">
        <CardHeader
          title="Analyse Pareto des pannes"
          subtitle="Classement sur 12 mois par temps d’arrêt, avec pourcentage cumulé"
        />
        {dashboard.pareto.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-muted">Pas encore assez d’incidents pour calculer le Pareto.</p>
        ) : (
          <div className="space-y-4 px-5 pb-5">
            {dashboard.pareto.map((cause, index) => (
              <div key={cause.cause} className="grid items-center gap-2 md:grid-cols-[minmax(220px,1.3fr)_minmax(220px,2fr)_110px_100px]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg" title={cause.cause}>{index + 1}. {cause.cause}</p>
                  <p className="text-xs text-fg-subtle">{cause.incidents} incident(s) · {formatDuration(cause.downtimeMinutes)}</p>
                </div>
                <div className="h-7 overflow-hidden rounded-md bg-surface-sunken">
                  <div
                    className={cn('flex h-full items-center justify-end rounded-md px-2 text-xs font-semibold text-white', cause.cumulativePct <= 80 ? 'bg-brand' : 'bg-info')}
                    style={{ width: `${Math.max(cause.sharePct, 4)}%` }}
                  >
                    {formatPercent(cause.sharePct, 1)}
                  </div>
                </div>
                <span className="tabular text-right text-sm text-fg-muted">cumul {formatPercent(cause.cumulativePct, 1)}</span>
                <span className="tabular text-right text-xs text-fg-subtle">{canSeeFinancials ? formatCents(cause.estimatedCostCents) : 'coût masqué'}</span>
              </div>
            ))}
            <p className="border-t border-line pt-3 text-xs text-fg-subtle">
              La zone bleue identifie les causes à traiter en priorité jusqu’au seuil cumulé de 80 %. « Cause non renseignée » mesure les diagnostics restant à compléter.
            </p>
          </div>
        )}
      </Card>
      ) : null}

      {shows('calendar') ? (
      <Card className="mb-5">
        <CardHeader
          title={`Calendrier préventif · ${monthTitle}`}
          subtitle="Les maintenances terminées restent visibles et les interventions récurrentes recréent leur prochaine échéance"
          action={
            <div className="flex gap-2">
              <ButtonLink href={`/maintenance?month=${previousMonth}`} variant="secondary" size="sm">Mois précédent</ButtonLink>
              <ButtonLink href={`/maintenance?month=${nextMonth}`} variant="secondary" size="sm">Mois suivant</ButtonLink>
            </div>
          }
        />
        <div className="overflow-x-auto px-5 pb-5">
          <div className="grid min-w-[920px] grid-cols-7 border-t border-l border-line">
            {WEEKDAYS.map((day) => <div key={day} className="border-r border-b border-line bg-surface-sunken px-2 py-2 text-center text-xs font-semibold text-fg-subtle">{day}</div>)}
            {calendarDays.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const inMonth = day.getUTCMonth() === dashboard.month.monthIndex;
              const dayTasks = tasksByDay.get(key) ?? [];
              return (
                <div key={key} className={cn('min-h-28 border-r border-b border-line p-2', !inMonth && 'bg-surface-sunken/60')}>
                  <span className={cn('tabular text-xs font-medium', inMonth ? 'text-fg' : 'text-fg-subtle')}>{day.getUTCDate()}</span>
                  <div className="mt-1.5 space-y-1.5">
                    {dayTasks.map(({ task, machineName }) => (
                      <div key={task.id} className={cn('rounded-md border px-2 py-1.5 text-[0.6875rem]', task.status === 'completed' ? 'border-normal/25 bg-normal/10' : task.scheduledAt < dashboard.now ? 'border-critical/25 bg-critical/10' : 'border-brand/25 bg-brand-soft')}>
                        <p className="font-semibold text-fg">{machineName}</p>
                        <p className="line-clamp-2 text-fg-muted">{task.title}</p>
                        <p className="mt-0.5 text-fg-subtle">{new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(task.scheduledAt)} · {task.estimatedMinutes} min</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      ) : null}

      {shows('tasks') ? (
      <Card className="mb-5">
        <CardHeader title="Interventions préventives · machines" subtitle="Affectation, compétence, récurrence et état d’exécution — données réelles" />
        {dashboard.tasks.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-fg-muted">Aucune maintenance préventive planifiée. Le responsable maintenance peut créer le premier créneau avec le bouton en haut de page.</p>
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Machine</Th><Th>Intervention</Th><Th>Compétence / responsable</Th><Th>Récurrence</Th><Th>État</Th><Th>Action</Th></tr></thead>
            <tbody>
              {dashboard.tasks.map(({ task, machineName, machineCode, skillName, assignedFirstName, assignedLastName }) => (
                <Tr key={task.id}>
                  <Td className="whitespace-nowrap text-xs text-fg-muted">{formatDateTime(task.scheduledAt)}</Td>
                  <Td><Link href={`/machines/${task.machineId}`} className="font-medium hover:text-brand">{machineName}</Link><span className="block text-xs text-fg-subtle">{machineCode}</span></Td>
                  <Td><span className="font-medium">{task.title}</span>{task.description ? <span className="block max-w-[340px] truncate text-xs text-fg-subtle">{task.description}</span> : null}</Td>
                  <Td className="text-fg-muted">{skillName ?? 'Compétence non précisée'}<span className="block text-xs text-fg-subtle">{assignedFirstName ? `${assignedFirstName} ${assignedLastName}` : 'À affecter'}</span></Td>
                  <Td className="text-fg-muted">{RECURRENCE_LABELS[task.recurrence] ?? task.recurrence}</Td>
                  <Td><StatusBadge size="sm" severity={taskSeverity(task.status, task.scheduledAt, dashboard.now)}>{taskStatus(task.status, task.scheduledAt, dashboard.now)}</StatusBadge></Td>
                  <Td>{canWrite && task.status !== 'completed' && task.status !== 'cancelled' ? <CompleteMaintenanceButton taskId={task.id} /> : '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      ) : null}

      {shows('memory') ? (
      <Card>
        <CardHeader title="Mémoire des pannes" subtitle="Symptôme, cause racine et solution restent attachés à la machine" />
        <Table>
          <thead><tr><Th>Date</Th><Th>Incident / machine</Th><Th>Symptôme</Th><Th>Cause racine</Th><Th>Solution</Th><Th numeric>Arrêt</Th></tr></thead>
          <tbody>
            {dashboard.incidents.slice(0, 30).map(({ incident, machineName }) => (
              <Tr key={incident.id}>
                <Td className="whitespace-nowrap text-xs text-fg-subtle">{formatDate(incident.occurredAt)}</Td>
                <Td><StatusBadge severity={incident.severity} size="sm">{incident.reference}</StatusBadge><span className="mt-1 block text-xs text-fg-muted">{machineName ?? '—'}</span></Td>
                <Td className="max-w-[260px] text-fg-muted">{incident.symptom}</Td>
                <Td className={cn('max-w-[260px]', incident.rootCause ? 'text-fg' : 'font-medium text-warning')}>{incident.rootCause ?? 'À renseigner'}</Td>
                <Td className={cn('max-w-[260px]', incident.resolution ? 'text-normal' : 'text-fg-subtle')}>{incident.resolution ?? 'En attente du diagnostic'}</Td>
                <Td numeric className="text-fg-muted">{formatDuration(incident.downtimeMinutes)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      ) : null}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, detail, tone }: { icon: typeof AlertTriangle; label: string; value: string; detail: string; tone: 'critical' | 'warning' | 'info' | 'normal' }) {
  const tones = { critical: 'text-critical bg-critical/10', warning: 'text-warning bg-warning/10', info: 'text-info bg-info/10', normal: 'text-normal bg-normal/10' };
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3"><span className={cn('rounded-lg p-2', tones[tone])}><Icon className="size-4" /></span><div><p className="text-xs font-medium text-fg-muted">{label}</p><p className="tabular mt-1 text-2xl font-semibold text-fg">{value}</p><p className="mt-0.5 text-xs text-fg-subtle">{detail}</p></div></div>
    </Card>
  );
}
