'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { intervalsOverlap } from '../domain/machines';
import { formatDateTime } from '@/lib/format';
import { demoWriteRefusal } from '../demo/guard';

export type PlanningActionState = { ok?: boolean; message?: string };

class SchedulingConflictError extends Error {}

const planningSchema = z.object({
  productionOrderId: z.uuid('Ordre de fabrication requis.'),
  machineId: z.uuid('Presse requise.'),
  plannedStartAt: z.string().min(1, 'Début requis.'),
  plannedEndAt: z.string().min(1, 'Fin requise.'),
});

export async function scheduleProductionOrderAction(
  _state: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  let user;
  try {
    user = await assertPermission('planning:write');
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Action refusée.' };
  }

  const parsed = planningSchema.safeParse({
    productionOrderId: formData.get('productionOrderId'),
    machineId: formData.get('machineId'),
    plannedStartAt: formData.get('plannedStartAt'),
    plannedEndAt: formData.get('plannedEndAt'),
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const plannedStartAt = new Date(parsed.data.plannedStartAt);
  const plannedEndAt = new Date(parsed.data.plannedEndAt);
  if (
    Number.isNaN(plannedStartAt.getTime()) ||
    Number.isNaN(plannedEndAt.getTime()) ||
    plannedEndAt <= plannedStartAt
  ) {
    return { ok: false, message: 'La date de fin doit être postérieure au début.' };
  }

  const db = await getDb();
  const [order] = await db
    .select({
      id: t.productionOrders.id,
      number: t.productionOrders.number,
      productId: t.productionOrders.productId,
      machineId: t.productionOrders.machineId,
      plannedStartAt: t.productionOrders.plannedStartAt,
      plannedEndAt: t.productionOrders.plannedEndAt,
    })
    .from(t.productionOrders)
    .where(eq(t.productionOrders.id, parsed.data.productionOrderId))
    .limit(1);
  if (!order) return { ok: false, message: 'Ordre de fabrication introuvable.' };
  if (order.number.startsWith('SIM-')) {
    return { ok: false, message: 'Un ordre simulé est géré automatiquement par le simulateur de presses.' };
  }

  const [machine] = await db
    .select({ id: t.machines.id, name: t.machines.name, workshopId: t.machines.workshopId })
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Presse introuvable.' };

  if (user.workshopId && machine.workshopId !== user.workshopId) {
    return { ok: false, message: "Vous ne pouvez planifier que les presses de votre atelier." };
  }

  // La compatibilité pièce ↔ machine (§19) est revérifiée ici : le formulaire
  // ne propose déjà que des presses compatibles, mais l'action ne fait jamais
  // confiance à ce que le client a filtré.
  const [compatibility] = await db
    .select({ productId: t.productMachines.productId })
    .from(t.productMachines)
    .where(and(eq(t.productMachines.productId, order.productId), eq(t.productMachines.machineId, machine.id)))
    .limit(1);
  if (!compatibility) {
    return { ok: false, message: `Cette pièce n’est pas compatible avec ${machine.name}.` };
  }

  // Aucun verrouillage optimiste n'empêchait deux planificateurs de charger la
  // même presse sur le même créneau en même temps (§19). Un verrou consultatif
  // par presse, tenu jusqu'à la fin de la transaction, sérialise les
  // affectations concurrentes : le second arrivé revoit un état à jour et
  // détecte alors le vrai conflit, plutôt que d'écraser silencieusement le
  // premier.
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${machine.id}))`);

      const overlapping = await tx
        .select({
          id: t.productionOrders.id,
          number: t.productionOrders.number,
          plannedStartAt: t.productionOrders.plannedStartAt,
          plannedEndAt: t.productionOrders.plannedEndAt,
        })
        .from(t.productionOrders)
        .where(
          and(
            eq(t.productionOrders.machineId, machine.id),
            ne(t.productionOrders.id, order.id),
            notInArray(t.productionOrders.status, ['cancelled', 'done']),
          ),
        );

      const conflict = overlapping.find((existing) =>
        intervalsOverlap(existing.plannedStartAt, existing.plannedEndAt, plannedStartAt, plannedEndAt),
      );
      if (conflict) {
        throw new SchedulingConflictError(
          `${machine.name} est déjà réservée par l’ordre ${conflict.number} du ${formatDateTime(conflict.plannedStartAt)} au ${formatDateTime(conflict.plannedEndAt)}. Choisissez un autre créneau ou une autre presse.`,
        );
      }

      await tx
        .update(t.productionOrders)
        .set({
          machineId: machine.id,
          plannedStartAt,
          plannedEndAt,
          status: 'planned',
        })
        .where(eq(t.productionOrders.id, order.id));
    });
  } catch (error) {
    if (error instanceof SchedulingConflictError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'planning.schedule',
    entityType: 'production_order',
    entityId: order.id,
    entityLabel: order.number,
    previousValue: {
      machineId: order.machineId,
      plannedStartAt: order.plannedStartAt,
      plannedEndAt: order.plannedEndAt,
    },
    newValue: { machineId: machine.id, machineName: machine.name, plannedStartAt, plannedEndAt },
  });

  revalidatePath('/planning');
  redirect('/planning');
}

const assignSchema = z.object({
  employeeId: z.uuid('Opérateur requis.'),
  machineId: z.uuid('Presse invalide.').nullable(),
});

/**
 * Affectation d'un opérateur à une presse pour la période en cours (§19).
 * Distincte de `production_runs`, qui journalise les sessions réellement
 * travaillées : ceci est une décision de planning, pas un fait constaté.
 */
export async function assignEmployeeToMachineAction(
  _state: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  let user;
  try {
    user = await assertPermission('planning:write');
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Action refusée.' };
  }

  const rawMachineId = formData.get('machineId');
  const parsed = assignSchema.safeParse({
    employeeId: formData.get('employeeId'),
    machineId: rawMachineId ? rawMachineId : null,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const db = await getDb();
  const [employee] = await db
    .select({
      id: t.employees.id,
      firstName: t.employees.firstName,
      lastName: t.employees.lastName,
      workshopId: t.employees.workshopId,
      assignedMachineId: t.employees.assignedMachineId,
    })
    .from(t.employees)
    .where(eq(t.employees.id, parsed.data.employeeId))
    .limit(1);
  if (!employee) return { ok: false, message: 'Opérateur introuvable.' };

  let machine: { id: string; name: string; workshopId: string } | null = null;
  if (parsed.data.machineId) {
    [machine] = await db
      .select({ id: t.machines.id, name: t.machines.name, workshopId: t.machines.workshopId })
      .from(t.machines)
      .where(eq(t.machines.id, parsed.data.machineId))
      .limit(1);
    if (!machine) return { ok: false, message: 'Presse introuvable.' };
    if (user.workshopId && machine.workshopId !== user.workshopId) {
      return { ok: false, message: "Vous ne pouvez affecter que les presses de votre atelier." };
    }
  }

  await db
    .update(t.employees)
    .set({ assignedMachineId: machine?.id ?? null })
    .where(eq(t.employees.id, employee.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'planning.assign_operator',
    entityType: 'employee',
    entityId: employee.id,
    entityLabel: `${employee.firstName} ${employee.lastName}`,
    previousValue: { assignedMachineId: employee.assignedMachineId },
    newValue: { assignedMachineId: machine?.id ?? null, machineName: machine?.name ?? null },
  });

  revalidatePath('/planning');
  return { ok: true };
}

const cancelSchema = z.object({
  productionOrderId: z.uuid('Ordre de fabrication requis.'),
});

/**
 * Retrait d'un ordre planifié par erreur (§19). Seuls les ordres non encore
 * démarrés (`planned` / `released`) peuvent être retirés : un ordre `running`
 * ou `paused` correspond à une presse réellement chargée, son arrêt relève du
 * flux machine (incident), pas d'une correction de planning.
 */
export async function cancelProductionOrderAction(
  _state: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  let user;
  try {
    user = await assertPermission('planning:write');
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Action refusée.' };
  }

  const parsed = cancelSchema.safeParse({
    productionOrderId: formData.get('productionOrderId'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const db = await getDb();
  const [order] = await db
    .select({
      id: t.productionOrders.id,
      number: t.productionOrders.number,
      status: t.productionOrders.status,
      machineId: t.productionOrders.machineId,
    })
    .from(t.productionOrders)
    .where(eq(t.productionOrders.id, parsed.data.productionOrderId))
    .limit(1);
  if (!order) return { ok: false, message: 'Ordre de fabrication introuvable.' };
  if (order.number.startsWith('SIM-')) {
    return { ok: false, message: 'Un ordre simulé est géré automatiquement par le simulateur de presses.' };
  }
  if (order.status !== 'planned' && order.status !== 'released') {
    return { ok: false, message: 'Seul un ordre planifié ou lancé peut être retiré du planning.' };
  }

  if (user.workshopId && order.machineId) {
    const [machine] = await db
      .select({ workshopId: t.machines.workshopId })
      .from(t.machines)
      .where(eq(t.machines.id, order.machineId))
      .limit(1);
    if (machine && machine.workshopId !== user.workshopId) {
      return { ok: false, message: 'Vous ne pouvez retirer que les ordres de votre atelier.' };
    }
  }

  await db
    .update(t.productionOrders)
    .set({ status: 'cancelled' })
    .where(eq(t.productionOrders.id, order.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'planning.cancel',
    entityType: 'production_order',
    entityId: order.id,
    entityLabel: order.number,
    previousValue: { status: order.status },
    newValue: { status: 'cancelled' },
  });

  revalidatePath('/planning');
  return { ok: true };
}
