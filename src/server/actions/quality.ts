'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';

export type QualityActionState = { ok?: boolean; message?: string };

const declareSchema = z.object({
  machineId: z.uuid(),
  defect: z.enum([
    'appearance',
    'dimension',
    'material',
    'shrinkage',
    'burn',
    'flash',
    'contamination',
    'other',
  ]),
  rejectedUnits: z.coerce.number().int().min(1, 'Au moins une pièce.').max(100_000),
  lotNumber: z.string().trim().max(60).optional(),
  comment: z.string().trim().max(1000).optional(),
});

/**
 * Déclaration d'un rebut depuis la fiche machine (§34).
 * Rattache automatiquement l'ordre de fabrication en cours sur la presse,
 * s'il y en a un — jamais saisi à la main.
 */
export async function declareQualityEventAction(
  _state: QualityActionState,
  formData: FormData,
): Promise<QualityActionState> {
  const user = await assertPermission('quality:write');

  const parsed = declareSchema.safeParse({
    machineId: formData.get('machineId'),
    defect: formData.get('defect'),
    rejectedUnits: formData.get('rejectedUnits'),
    lotNumber: formData.get('lotNumber') || undefined,
    comment: formData.get('comment') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const db = await getDb();
  const [machine] = await db
    .select({ id: t.machines.id, name: t.machines.name })
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  const [currentOrder] = await db
    .select({ id: t.productionOrders.id })
    .from(t.productionOrders)
    .where(
      and(eq(t.productionOrders.machineId, machine.id), eq(t.productionOrders.status, 'running')),
    )
    .limit(1);

  const [event] = await db
    .insert(t.qualityEvents)
    .values({
      productionOrderId: currentOrder?.id ?? null,
      machineId: machine.id,
      defect: parsed.data.defect,
      rejectedUnits: parsed.data.rejectedUnits,
      lotNumber: parsed.data.lotNumber || null,
      comment: parsed.data.comment || null,
      declaredBy: user.employeeId ?? null,
    })
    .returning();

  if (currentOrder) {
    await db
      .update(t.productionOrders)
      .set({ rejectedUnits: sql`${t.productionOrders.rejectedUnits} + ${parsed.data.rejectedUnits}` })
      .where(eq(t.productionOrders.id, currentOrder.id));
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'quality.declare',
    entityType: 'quality_event',
    entityId: event.id,
    entityLabel: `${machine.name} — ${parsed.data.defect}`,
    newValue: { defect: event.defect, rejectedUnits: event.rejectedUnits, lotNumber: event.lotNumber },
  });

  revalidatePath(`/machines/${machine.id}`);
  revalidatePath(`/machines/${machine.id}/qualite`);
  revalidatePath('/qualite');
  revalidatePath('/');

  return { ok: true, message: `${parsed.data.rejectedUnits} pièce(s) rebutée(s) déclarée(s).` };
}
