import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getMachineIdentity } from '@/server/services/machine-fleet';
import { getAvailableMaintenanceStaff } from '@/server/services/maintenance';
import { Panel } from '@/components/machines/overview-cards';
import {
  CancelMaintenanceButton,
  CompleteMaintenanceButton,
  ScheduleMaintenanceForm,
} from '@/components/factory/maintenance-forms';
import { Table, Td, Th, Tr } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDate, formatDuration } from '@/lib/format';
import styles from '@/components/machines/machines.module.css';

export const metadata: Metadata = { title: 'Maintenance machine' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planifiée',
  completed: 'Réalisée',
  cancelled: 'Annulée',
};

const STATUS_STYLE: Record<string, string> = {
  planned: 'border-info/40 bg-info-soft text-info',
  completed: 'border-normal/40 bg-normal-soft text-normal',
  cancelled: 'border-line-strong bg-surface-sunken text-fg-muted',
};

export default async function MachineMaintenancePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('machines:read');
  const { id } = await params;

  const machine = await getMachineIdentity(id);
  if (!machine) notFound();

  const canWrite = can(user.permissions, 'maintenance:write');

  const db = await getDb();
  const [tasks, skillRows, staff] = await Promise.all([
    db
      .select({
        task: t.maintenanceTasks,
        skillName: t.skills.name,
        employeeFirstName: t.employees.firstName,
        employeeLastName: t.employees.lastName,
      })
      .from(t.maintenanceTasks)
      .leftJoin(t.skills, eq(t.maintenanceTasks.requiredSkillId, t.skills.id))
      .leftJoin(t.employees, eq(t.maintenanceTasks.assignedEmployeeId, t.employees.id))
      .where(eq(t.maintenanceTasks.machineId, id))
      .orderBy(asc(t.maintenanceTasks.scheduledAt)),
    canWrite
      ? db
          .select({ id: t.skills.id, name: t.skills.name })
          .from(t.skills)
          .where(eq(t.skills.category, 'Maintenance'))
      : Promise.resolve([]),
    canWrite ? getAvailableMaintenanceStaff(db, new Date()) : Promise.resolve([]),
  ]);

  const planned = tasks.filter((row) => row.task.status === 'planned');
  const completed = tasks.filter((row) => row.task.status === 'completed');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Tile label="Interventions planifiées" value={String(planned.length)} />
        <Tile label="Interventions réalisées" value={String(completed.length)} />
        <Tile label="Prochaine échéance" value={planned[0] ? formatDate(planned[0].task.scheduledAt) : '—'} />
      </div>

      {canWrite ? (
        <ScheduleMaintenanceForm
          machines={[{ id: machine.id, label: machine.name }]}
          skills={skillRows.map((skill) => ({ id: skill.id, label: skill.name }))}
          staff={staff.map((person) => ({
            id: person.employeeId,
            label: `${person.fullName} · ${person.skillName} N${person.skillLevel}`,
          }))}
        />
      ) : null}

      <Panel
        title="Plan de maintenance de la presse"
        hint="Interventions préventives et curatives rattachées à cette machine"
        bodyClassName="px-0 pb-0"
      >
        {tasks.length === 0 ? (
          <p className="px-5 pb-5 text-[0.8125rem] text-fg-muted">
            Aucune intervention planifiée sur cette presse.{' '}
            <Link href="/maintenance" prefetch={false} className="text-brand hover:underline">
              Ouvrir le planning de maintenance
            </Link>
            .
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Échéance</Th>
                <Th>Intervention</Th>
                <Th>État</Th>
                <Th>Compétence requise</Th>
                <Th>Affectée à</Th>
                <Th numeric>Durée estimée</Th>
                {canWrite ? <Th numeric>Actions</Th> : null}
              </tr>
            </thead>
            <tbody>
              {tasks.map(({ task, skillName, employeeFirstName, employeeLastName }) => (
                <Tr key={task.id}>
                  <Td className="tabular font-medium">{formatDate(task.scheduledAt)}</Td>
                  <Td>
                    <span className="block text-fg">{task.title}</span>
                    {task.description ? (
                      <span className="mt-0.5 block text-xs text-fg-muted">{task.description}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <span
                      className={cn(
                        'inline-flex rounded-lg border px-2.5 py-1 text-[0.75rem] font-medium',
                        STATUS_STYLE[task.status] ?? STATUS_STYLE.planned,
                      )}
                    >
                      {STATUS_LABELS[task.status] ?? task.status}
                    </span>
                  </Td>
                  <Td className="text-fg-muted">{skillName ?? '—'}</Td>
                  <Td className="text-fg-muted">
                    {employeeFirstName && employeeLastName
                      ? `${employeeFirstName} ${employeeLastName}`
                      : 'Non affectée'}
                  </Td>
                  <Td numeric className="text-fg-muted">
                    {formatDuration(task.estimatedMinutes)}
                  </Td>
                  {canWrite ? (
                    <Td className="text-right">
                      {task.status === 'planned' ? (
                        <div className="flex justify-end gap-2">
                          <CompleteMaintenanceButton taskId={task.id} />
                          <CancelMaintenanceButton taskId={task.id} taskTitle={task.title} />
                        </div>
                      ) : null}
                    </Td>
                  ) : null}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(styles.panel, 'rounded-2xl border border-line p-4')}>
      <p className="text-[0.8125rem] text-fg-muted">{label}</p>
      <p className="tabular mt-2 text-[1.625rem] leading-none font-semibold text-fg">{value}</p>
    </div>
  );
}
