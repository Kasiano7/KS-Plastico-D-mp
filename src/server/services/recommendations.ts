import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from './audit';
import type { SessionUser } from '../auth/session';

/**
 * Cycle de vie d'une recommandation (§13) :
 *
 *   proposed → simulated → approved | rejected → executed
 *
 * Rien n'est exécuté sans une ligne d'approbation nominative. L'exécution
 * elle-même est traduite en mutations métier explicites, jamais en « magie ».
 */

export type RecommendationAction =
  | { type: 'move_production_order'; productionOrderNumber: string; toMachine: string; [key: string]: unknown }
  | { type: 'create_purchase_requirement'; sku: string; quantity: number; supplier?: string; [key: string]: unknown }
  | { type: 'reschedule_order'; orderNumber: string; newStartAt: string; [key: string]: unknown }
  | { type: 'reorder_sequence'; machine: string; sequence: string[]; [key: string]: unknown };

export type DecisionResult = { ok: true; message: string } | { ok: false; message: string };

export async function decideRecommendation(
  recommendationId: string,
  user: SessionUser,
  decision: 'approved' | 'rejected',
  justification?: string,
): Promise<DecisionResult> {
  const db = await getDb();

  const [recommendation] = await db
    .select()
    .from(t.recommendations)
    .where(eq(t.recommendations.id, recommendationId))
    .limit(1);

  if (!recommendation) return { ok: false, message: 'Recommandation introuvable.' };
  if (recommendation.status === 'executed' || recommendation.status === 'rejected') {
    return { ok: false, message: 'Cette recommandation a déjà été traitée.' };
  }

  await db.insert(t.approvals).values({
    recommendationId,
    userId: user.id,
    decision,
    justification: justification?.trim() || null,
  });

  if (decision === 'rejected') {
    await db
      .update(t.recommendations)
      .set({ status: 'rejected' })
      .where(eq(t.recommendations.id, recommendationId));

    await recordAudit({
      userId: user.id,
      userLabel: user.fullName,
      action: 'recommendation.reject',
      entityType: 'recommendation',
      entityId: recommendationId,
      entityLabel: recommendation.title,
      previousValue: { status: recommendation.status },
      newValue: { status: 'rejected' },
      justification: justification ?? null,
    });

    return { ok: true, message: 'Recommandation refusée. La décision est tracée.' };
  }

  const execution = await executeRecommendation(recommendation.action as RecommendationAction);

  await db
    .update(t.recommendations)
    .set({ status: execution.applied ? 'executed' : 'approved' })
    .where(eq(t.recommendations.id, recommendationId));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: execution.applied ? 'recommendation.execute' : 'recommendation.approve',
    entityType: 'recommendation',
    entityId: recommendationId,
    entityLabel: recommendation.title,
    previousValue: { status: recommendation.status },
    newValue: { status: execution.applied ? 'executed' : 'approved', effect: execution.message },
    justification: justification ?? null,
  });

  return { ok: true, message: execution.message };
}

type ExecutionResult = { applied: boolean; message: string };

/**
 * Traduit une action recommandée en mutation réelle.
 * Toute action inconnue est refusée : on ne devine jamais une intention.
 */
async function executeRecommendation(action: RecommendationAction): Promise<ExecutionResult> {
  const db = await getDb();

  switch (action?.type) {
    case 'move_production_order': {
      const [target] = await db
        .select()
        .from(t.machines)
        .where(eq(t.machines.code, action.toMachine))
        .limit(1);
      const [productionOrder] = await db
        .select()
        .from(t.productionOrders)
        .where(eq(t.productionOrders.number, action.productionOrderNumber))
        .limit(1);

      if (!target || !productionOrder) {
        return { applied: false, message: 'Approuvée, mais la machine ou l’ordre est introuvable.' };
      }

      const [compatibility] = await db
        .select()
        .from(t.productMachines)
        .where(
          and(
            eq(t.productMachines.productId, productionOrder.productId),
            eq(t.productMachines.machineId, target.id),
          ),
        )
        .limit(1);

      if (!compatibility) {
        return {
          applied: false,
          message: `Approuvée, mais ${action.toMachine} n’est pas compatible avec la pièce de l’ordre ${action.productionOrderNumber}.`,
        };
      }

      await db
        .update(t.productionOrders)
        .set({
          machineId: target.id,
          plannedUnitsPerHour: compatibility.unitsPerHour,
          status: 'planned',
        })
        .where(eq(t.productionOrders.id, productionOrder.id));

      return {
        applied: true,
        message: `${action.productionOrderNumber} est désormais planifié sur ${action.toMachine}.`,
      };
    }

    case 'create_purchase_requirement': {
      const [item] = await db
        .select()
        .from(t.inventoryItems)
        .where(eq(t.inventoryItems.sku, action.sku))
        .limit(1);

      if (!item) return { applied: false, message: 'Approuvée, mais l’article est introuvable.' };

      const orderBy = new Date();
      orderBy.setDate(orderBy.getDate() + 1);
      orderBy.setHours(12, 0, 0, 0);

      await db.insert(t.purchaseRequirements).values({
        itemId: item.id,
        supplierId: item.supplierId,
        severity: 'warning',
        requiredQuantity: action.quantity,
        recommendedQuantity: action.quantity,
        orderByAt: orderBy,
        reason: 'Généré par approbation d’une recommandation.',
      });

      return {
        applied: true,
        message: `Besoin d’achat créé : ${action.quantity} × ${item.name}.`,
      };
    }

    case 'reschedule_order': {
      const [order] = await db
        .select()
        .from(t.customerOrders)
        .where(eq(t.customerOrders.number, action.orderNumber))
        .limit(1);

      if (!order) return { applied: false, message: 'Approuvée, mais la commande est introuvable.' };

      const newStart = new Date(action.newStartAt);
      const productionOrders = await db
        .select()
        .from(t.productionOrders)
        .where(eq(t.productionOrders.customerOrderId, order.id));

      for (const productionOrder of productionOrders) {
        const durationMs =
          productionOrder.plannedEndAt.getTime() - productionOrder.plannedStartAt.getTime();
        await db
          .update(t.productionOrders)
          .set({
            plannedStartAt: newStart,
            plannedEndAt: new Date(newStart.getTime() + durationMs),
          })
          .where(eq(t.productionOrders.id, productionOrder.id));
      }

      return {
        applied: true,
        message: `Commande #${action.orderNumber} replanifiée (${productionOrders.length} ordre(s) déplacé(s)).`,
      };
    }

    case 'reorder_sequence': {
      const productionOrders = await db
        .select()
        .from(t.productionOrders)
        .where(inArray(t.productionOrders.number, action.sequence));

      if (productionOrders.length === 0) {
        return { applied: false, message: 'Approuvée, mais aucun ordre de la séquence n’existe.' };
      }

      // On conserve la fenêtre globale et on ré-enchaîne les ordres dans
      // l'ordre demandé, en préservant la durée de chacun.
      const sorted = action.sequence
        .map((number) => productionOrders.find((order) => order.number === number))
        .filter((order): order is (typeof productionOrders)[number] => Boolean(order));

      let cursor = sorted.reduce(
        (earliest, order) => (order.plannedStartAt < earliest ? order.plannedStartAt : earliest),
        sorted[0].plannedStartAt,
      );

      for (const order of sorted) {
        const durationMs = order.plannedEndAt.getTime() - order.plannedStartAt.getTime();
        const end = new Date(cursor.getTime() + durationMs);
        await db
          .update(t.productionOrders)
          .set({ plannedStartAt: cursor, plannedEndAt: end })
          .where(eq(t.productionOrders.id, order.id));
        cursor = end;
      }

      return {
        applied: true,
        message: `Séquence réordonnée sur ${action.machine} : ${action.sequence.join(' → ')}.`,
      };
    }

    default:
      return {
        applied: false,
        message: 'Approuvée. Aucune exécution automatique n’est définie pour ce type d’action.',
      };
  }
}
