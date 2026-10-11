'use server';

import { revalidatePath } from 'next/cache';
import { addMonths } from 'date-fns';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { parisLocalDateTime } from '../domain/maintenance';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type MaintenanceActionState = { ok?: boolean; message?: string };

const optionalUuid = z.union([z.uuid(), z.literal('')]).transform((value) => value || null);

const scheduleSchema = z.object({
  machineId: z.uuid(),
  title: z.string().trim().min(4, 'Le titre doit comporter au moins 4 caractères.').max(160),
  description: z.string().trim().max(1200).optional(),
  scheduledAt: z.string(),
  estimatedMinutes: z.coerce.number().int().min(15).max(1_440),
  requiredSkillId: optionalUuid,
  assignedEmployeeId: optionalUuid,
  recurrence: z.enum(['none', 'monthly', 'quarterly', 'semiannual', 'annual']),
});

export async function scheduleMaintenanceAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('maintenance:write');
  const parsed = scheduleSchema.safeParse({
    machineId: formData.get('machineId'),
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    scheduledAt: formData.get('scheduledAt'),
    estimatedMinutes: formData.get('estimatedMinutes'),
    requiredSkillId: formData.get('requiredSkillId') ?? '',
    assignedEmployeeId: formData.get('assignedEmployeeId') ?? '',
    recurrence: formData.get('recurrence'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const scheduledAt = parisLocalDateTime(parsed.data.scheduledAt);
  if (!scheduledAt) return { ok: false, message: 'Date ou heure invalide.' };

  const db = await getDb();
  const [machine] = await db
    .select({ id: t.machines.id, name: t.machines.name })
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  const [task] = await db
    .insert(t.maintenanceTasks)
    .values({
      machineId: parsed.data.machineId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      scheduledAt,
      estimatedMinutes: parsed.data.estimatedMinutes,
      requiredSkillId: parsed.data.requiredSkillId,
      assignedEmployeeId: parsed.data.assignedEmployeeId,
      recurrence: parsed.data.recurrence,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'maintenance.schedule',
    entityType: 'maintenance_task',
    entityId: task.id,
    entityLabel: `${machine.name} — ${task.title}`,
    newValue: { scheduledAt, recurrence: task.recurrence, estimatedMinutes: task.estimatedMinutes },
  });

  revalidatePath('/maintenance');
  revalidatePath(`/machines/${machine.id}`);
  return { ok: true, message: `Intervention planifiée pour ${machine.name}.` };
}

const resolveSchema = z.object({
  incidentId: z.uuid(),
  rootCause: z.string().trim().min(4, 'Précisez la cause racine.').max(1200),
  resolution: z.string().trim().min(4, 'Précisez la solution appliquée.').max(2000),
  downtimeMinutes: z.coerce.number().int().min(0).max(50_000),
  tags: z.string().max(400).optional(),
});

export async function resolveIncidentAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('maintenance:write');
  const parsed = resolveSchema.safeParse({
    incidentId: formData.get('incidentId'),
    rootCause: formData.get('rootCause'),
    resolution: formData.get('resolution'),
    downtimeMinutes: formData.get('downtimeMinutes'),
    tags: formData.get('tags') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const db = await getDb();
  const [incident] = await db
    .select()
    .from(t.incidents)
    .where(eq(t.incidents.id, parsed.data.incidentId))
    .limit(1);
  if (!incident) return { ok: false, message: 'Incident introuvable.' };
  if (incident.status === 'resolved' || incident.status === 'closed') {
    return { ok: false, message: 'Cet incident est déjà résolu.' };
  }

  const resolvedAt = new Date();
  const tags = parsed.data.tags
    ? parsed.data.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : incident.tags;
  await db
    .update(t.incidents)
    .set({
      status: 'resolved',
      rootCause: parsed.data.rootCause,
      resolution: parsed.data.resolution,
      downtimeMinutes: parsed.data.downtimeMinutes,
      tags,
      resolvedAt,
    })
    .where(eq(t.incidents.id, incident.id));
  await db
    .update(t.alerts)
    .set({ status: 'resolved', resolvedAt })
    .where(eq(t.alerts.incidentId, incident.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'incident.resolve',
    entityType: 'incident',
    entityId: incident.id,
    entityLabel: incident.reference,
    previousValue: { status: incident.status },
    newValue: { status: 'resolved', downtimeMinutes: parsed.data.downtimeMinutes },
    justification: parsed.data.resolution,
  });

  revalidatePath('/maintenance');
  revalidatePath('/historique');
  revalidatePath('/alertes');
  if (incident.machineId) revalidatePath(`/machines/${incident.machineId}`);
  return { ok: true, message: `${incident.reference} résolu et ajouté à la mémoire des pannes.` };
}

const completeSchema = z.object({ taskId: z.uuid() });

export async function completeMaintenanceTaskAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('maintenance:write');
  const parsed = completeSchema.safeParse({ taskId: formData.get('taskId') });
  if (!parsed.success) return { ok: false, message: 'Intervention invalide.' };

  const db = await getDb();
  const [task] = await db
    .select()
    .from(t.maintenanceTasks)
    .where(eq(t.maintenanceTasks.id, parsed.data.taskId))
    .limit(1);
  if (!task) return { ok: false, message: 'Intervention introuvable.' };
  if (task.status === 'completed') return { ok: false, message: 'Intervention déjà terminée.' };

  const completedAt = new Date();
  await db
    .update(t.maintenanceTasks)
    .set({ status: 'completed', completedAt, completedBy: user.employeeId ?? user.id })
    .where(eq(t.maintenanceTasks.id, task.id));

  const recurrenceMonths = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 } as const;
  const months = recurrenceMonths[task.recurrence as keyof typeof recurrenceMonths];
  if (months) {
    await db.insert(t.maintenanceTasks).values({
      machineId: task.machineId,
      title: task.title,
      description: task.description,
      scheduledAt: addMonths(task.scheduledAt, months),
      estimatedMinutes: task.estimatedMinutes,
      requiredSkillId: task.requiredSkillId,
      assignedEmployeeId: task.assignedEmployeeId,
      recurrence: task.recurrence,
    });
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'maintenance.complete',
    entityType: 'maintenance_task',
    entityId: task.id,
    entityLabel: task.title,
    previousValue: { status: task.status },
    newValue: { status: 'completed', completedAt, nextOccurrenceCreated: Boolean(months) },
  });

  revalidatePath('/maintenance');
  revalidatePath(`/machines/${task.machineId}`);
  return { ok: true, message: 'Intervention terminée et historique mis à jour.' };
}

export async function cancelMaintenanceTaskAction(
  _state: MaintenanceActionState,
  formData: FormData,
): Promise<MaintenanceActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('maintenance:write');
  const parsed = completeSchema.safeParse({ taskId: formData.get('taskId') });
  if (!parsed.success) return { ok: false, message: 'Intervention invalide.' };

  const db = await getDb();
  const [task] = await db
    .select()
    .from(t.maintenanceTasks)
    .where(eq(t.maintenanceTasks.id, parsed.data.taskId))
    .limit(1);
  if (!task) return { ok: false, message: 'Intervention introuvable.' };
  if (task.status === 'completed' || task.status === 'cancelled') {
    return { ok: false, message: 'Cette intervention est déjà clôturée.' };
  }

  await db
    .update(t.maintenanceTasks)
    .set({ status: 'cancelled' })
    .where(eq(t.maintenanceTasks.id, task.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'maintenance.cancel',
    entityType: 'maintenance_task',
    entityId: task.id,
    entityLabel: task.title,
    previousValue: { status: task.status },
    newValue: { status: 'cancelled' },
  });

  revalidatePath('/maintenance');
  revalidatePath(`/machines/${task.machineId}`);
  return { ok: true, message: 'Intervention annulée.' };
}
