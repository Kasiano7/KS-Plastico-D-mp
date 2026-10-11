'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';

export type ProductionOrderActionState = { ok?: boolean; message?: string };

const TRANSITIONS = {
  start: {
    from: ['planned', 'released'],
    to: 'running',
    label: 'démarré',
    action: 'production_order.start',
  },
  pause: {
    from: ['running'],
    to: 'paused',
    label: 'suspendu',
    action: 'production_order.pause',
  },
  resume: {
    from: ['paused'],
    to: 'running',
    label: 'repris',
    action: 'production_order.resume',
  },
  complete: {
    from: ['running', 'paused'],
    to: 'done',
    label: 'clôturé',
    action: 'production_order.complete',
  },
} as const;

const schema = z.object({
  productionOrderId: z.uuid(),
  transition: z.enum(['start', 'pause', 'resume', 'complete']),
});

/**
 * Cycle de vie d'un ordre de fabrication réel (§19, § poste opérateur).
 *
 * Avant cette action, seuls les ordres du simulateur de presses passaient à
 * l'état « en cours » (télémétrie simulée) — un ordre réel, planifié, restait
 * « planifié » indéfiniment : aucune décision humaine ne pouvait le faire
 * avancer. Une seule action couvre les quatre transitions, chacune vérifiée
 * contre l'état actuel plutôt que fait confiance au client.
 */
export async function updateProductionOrderStatusAction(
  _state: ProductionOrderActionState,
  formData: FormData,
): Promise<ProductionOrderActionState> {
  const user = await assertPermission('production:write');

  const parsed = schema.safeParse({
    productionOrderId: formData.get('productionOrderId'),
    transition: formData.get('transition'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [order] = await db
    .select()
    .from(t.productionOrders)
    .where(eq(t.productionOrders.id, parsed.data.productionOrderId))
    .limit(1);
  if (!order) return { ok: false, message: 'Ordre de fabrication introuvable.' };
  if (order.number.startsWith('SIM-')) {
    return { ok: false, message: 'Un ordre simulé est géré automatiquement par le simulateur de presses.' };
  }

  const transition = TRANSITIONS[parsed.data.transition];
  if (!(transition.from as readonly string[]).includes(order.status)) {
    return {
      ok: false,
      message: `Impossible : l’ordre ${order.number} n’est pas dans un état permettant cette action.`,
    };
  }

  const now = new Date();

  if (transition.to === 'running' && order.machineId) {
    // Au plus un ordre « en cours » par presse — même invariant que le
    // simulateur applique déjà à ses propres ordres.
    await db
      .update(t.productionOrders)
      .set({ status: 'paused' })
      .where(
        and(
          eq(t.productionOrders.machineId, order.machineId),
          eq(t.productionOrders.status, 'running'),
          ne(t.productionOrders.id, order.id),
        ),
      );
  }

  await db
    .update(t.productionOrders)
    .set({
      status: transition.to,
      ...(transition.to === 'running' && !order.actualStartAt ? { actualStartAt: now } : {}),
      ...(transition.to === 'done' ? { actualEndAt: now } : {}),
    })
    .where(eq(t.productionOrders.id, order.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: transition.action,
    entityType: 'production_order',
    entityId: order.id,
    entityLabel: order.number,
    previousValue: { status: order.status },
    newValue: { status: transition.to },
  });

  revalidatePath('/machines');
  if (order.machineId) revalidatePath(`/machines/${order.machineId}/production`);
  if (order.machineId) revalidatePath(`/machines/${order.machineId}`);
  revalidatePath('/production');
  revalidatePath('/planning');
  revalidatePath('/');

  return { ok: true, message: `Ordre ${order.number} ${transition.label}.` };
}
