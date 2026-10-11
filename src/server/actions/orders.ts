'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, count, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { planReservation } from '../domain/inventory';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type ActionState = { ok?: boolean; message?: string; orderId?: string };

const createOrderSchema = z.object({
  customerId: z.uuid('Client requis.'),
  productId: z.uuid('Pièce requise.'),
  quantityUnits: z.coerce.number().int().min(1, 'Quantité invalide.').max(1_000_000),
  dueAt: z.string().min(1, 'Date souhaitée requise.'),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  notes: z.string().max(1000).optional(),
});

/**
 * Création d'une commande (§17).
 *
 * À la création, le stock disponible est **immédiatement réservé** : la
 * quantité promise à cette commande n'est plus disponible pour une autre.
 * Le reste devient la quantité à produire.
 */
export async function createOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('orders:write');

  const parsed = createOrderSchema.safeParse({
    customerId: formData.get('customerId'),
    productId: formData.get('productId'),
    quantityUnits: formData.get('quantityUnits'),
    dueAt: formData.get('dueAt'),
    priority: formData.get('priority') ?? 'normal',
    notes: formData.get('notes') || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const dueAt = new Date(`${parsed.data.dueAt}T17:00:00`);
  if (Number.isNaN(dueAt.getTime())) return { ok: false, message: 'Date souhaitée invalide.' };

  const db = await getDb();

  const [product] = await db
    .select()
    .from(t.products)
    .where(eq(t.products.id, parsed.data.productId))
    .limit(1);
  if (!product) return { ok: false, message: 'Pièce introuvable.' };

  const [{ total }] = await db.select({ total: count() }).from(t.customerOrders);
  const number = String(5900 + total);

  const [order] = await db
    .insert(t.customerOrders)
    .values({
      number,
      customerId: parsed.data.customerId,
      status: 'confirmed',
      priority: parsed.data.priority,
      orderedAt: new Date(),
      dueAt,
      notes: parsed.data.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  // Réservation immédiate du stock disponible.
  const [stockItem] = await db
    .select()
    .from(t.inventoryItems)
    .where(
      and(eq(t.inventoryItems.productId, product.id), eq(t.inventoryItems.kind, 'finished_good')),
    )
    .limit(1);

  const plan = stockItem
    ? planReservation(stockItem, parsed.data.quantityUnits)
    : { reserved: 0, missing: parsed.data.quantityUnits, fullyCovered: false };

  await db.insert(t.orderLines).values({
    orderId: order.id,
    productId: product.id,
    quantityUnits: parsed.data.quantityUnits,
    reservedUnits: plan.reserved,
    producedUnits: 0,
    unitPriceCents: product.unitPriceCents,
  });

  if (stockItem && plan.reserved > 0) {
    await db.insert(t.inventoryReservations).values({
      itemId: stockItem.id,
      customerOrderId: order.id,
      quantity: plan.reserved,
      status: 'active',
    });

    await db
      .update(t.inventoryItems)
      .set({
        quantityReserved: sql`${t.inventoryItems.quantityReserved} + ${plan.reserved}`,
        updatedAt: new Date(),
      })
      .where(eq(t.inventoryItems.id, stockItem.id));

    await db.insert(t.inventoryMovements).values({
      itemId: stockItem.id,
      type: 'adjustment',
      quantity: 0,
      quantityAfter: stockItem.quantityOnHand,
      reference: `Commande #${number}`,
      customerOrderId: order.id,
      userId: user.id,
      note: `Réservation de ${plan.reserved} ${stockItem.unit} pour la commande #${number}`,
    });
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'order.create',
    entityType: 'customer_order',
    entityId: order.id,
    entityLabel: `Commande #${number}`,
    newValue: {
      product: product.reference,
      quantityUnits: parsed.data.quantityUnits,
      reservedUnits: plan.reserved,
      toProduce: plan.missing,
      dueAt: dueAt.toISOString(),
    },
  });

  revalidatePath('/commandes');
  revalidatePath('/stocks');
  revalidatePath('/');

  redirect(`/commandes/${order.id}`);
}

const updateOrderSchema = z.object({
  orderId: z.uuid(),
  quantityUnits: z.coerce.number().int().min(1, 'Quantité invalide.').max(1_000_000),
  dueAt: z.string().min(1, 'Date souhaitée requise.'),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  notes: z.string().max(1000).optional(),
});

/** Modification d'une commande existante — date, priorité, notes et quantité. */
export async function updateOrderAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('orders:write');

  const parsed = updateOrderSchema.safeParse({
    orderId: formData.get('orderId'),
    quantityUnits: formData.get('quantityUnits'),
    dueAt: formData.get('dueAt'),
    priority: formData.get('priority'),
    notes: formData.get('notes') || undefined,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };

  const dueAt = new Date(`${parsed.data.dueAt}T17:00:00`);
  if (Number.isNaN(dueAt.getTime())) return { ok: false, message: 'Date souhaitée invalide.' };

  const db = await getDb();
  const [order] = await db
    .select()
    .from(t.customerOrders)
    .where(eq(t.customerOrders.id, parsed.data.orderId))
    .limit(1);
  if (!order) return { ok: false, message: 'Commande introuvable.' };

  if (order.status === 'shipped' || order.status === 'cancelled') {
    return { ok: false, message: 'Cette commande ne peut plus être modifiée.' };
  }

  // Ajustement de la ligne de commande et des réservations de stock si la quantité change.
  const [orderLine] = await db
    .select({
      id: t.orderLines.id,
      quantityUnits: t.orderLines.quantityUnits,
      reservedUnits: t.orderLines.reservedUnits,
      producedUnits: t.orderLines.producedUnits,
      productId: t.orderLines.productId,
    })
    .from(t.orderLines)
    .where(eq(t.orderLines.orderId, order.id))
    .limit(1);
  if (!orderLine) return { ok: false, message: 'Ligne de commande introuvable.' };

  const newQuantity = parsed.data.quantityUnits;
  if (newQuantity < orderLine.producedUnits) {
    return {
      ok: false,
      message: `Impossible : ${orderLine.producedUnits} pièces ont déjà été produites.`,
    };
  }

  const quantityDelta = newQuantity - orderLine.quantityUnits;

  if (quantityDelta > 0) {
    const [stockItem] = await db
      .select({
        id: t.inventoryItems.id,
        quantityOnHand: t.inventoryItems.quantityOnHand,
        quantityReserved: t.inventoryItems.quantityReserved,
      })
      .from(t.inventoryItems)
      .where(
        and(
          eq(t.inventoryItems.productId, orderLine.productId),
          eq(t.inventoryItems.kind, 'finished_good'),
        ),
      )
      .limit(1);

    let additionalReserved = 0;
    if (stockItem) {
      const available = stockItem.quantityOnHand - stockItem.quantityReserved;
      additionalReserved = Math.min(quantityDelta, Math.max(0, available));

      if (additionalReserved > 0) {
        const [existingRes] = await db
          .select({ id: t.inventoryReservations.id, quantity: t.inventoryReservations.quantity })
          .from(t.inventoryReservations)
          .where(
            and(
              eq(t.inventoryReservations.itemId, stockItem.id),
              eq(t.inventoryReservations.customerOrderId, order.id),
              eq(t.inventoryReservations.status, 'active'),
            ),
          )
          .limit(1);

        if (existingRes) {
          await db
            .update(t.inventoryReservations)
            .set({ quantity: existingRes.quantity + additionalReserved })
            .where(eq(t.inventoryReservations.id, existingRes.id));
        } else {
          await db.insert(t.inventoryReservations).values({
            itemId: stockItem.id,
            customerOrderId: order.id,
            quantity: additionalReserved,
            status: 'active',
          });
        }

        await db
          .update(t.inventoryItems)
          .set({
            quantityReserved: sql`${t.inventoryItems.quantityReserved} + ${additionalReserved}`,
            updatedAt: new Date(),
          })
          .where(eq(t.inventoryItems.id, stockItem.id));
      }
    }

    await db
      .update(t.orderLines)
      .set({
        quantityUnits: newQuantity,
        reservedUnits: orderLine.reservedUnits + additionalReserved,
      })
      .where(eq(t.orderLines.id, orderLine.id));
  } else if (quantityDelta < 0) {
    const excessReserved = Math.max(0, orderLine.reservedUnits - newQuantity);

    if (excessReserved > 0) {
      const [existingRes] = await db
        .select({
          id: t.inventoryReservations.id,
          quantity: t.inventoryReservations.quantity,
          itemId: t.inventoryReservations.itemId,
        })
        .from(t.inventoryReservations)
        .where(
          and(
            eq(t.inventoryReservations.customerOrderId, order.id),
            eq(t.inventoryReservations.status, 'active'),
          ),
        )
        .limit(1);

      if (existingRes) {
        const toRelease = Math.min(excessReserved, existingRes.quantity);
        const newResQty = existingRes.quantity - toRelease;

        if (newResQty <= 0) {
          await db
            .update(t.inventoryReservations)
            .set({ status: 'released', releasedAt: new Date() })
            .where(eq(t.inventoryReservations.id, existingRes.id));
        } else {
          await db
            .update(t.inventoryReservations)
            .set({ quantity: newResQty })
            .where(eq(t.inventoryReservations.id, existingRes.id));
        }

        await db
          .update(t.inventoryItems)
          .set({
            quantityReserved: sql`${t.inventoryItems.quantityReserved} - ${toRelease}`,
            updatedAt: new Date(),
          })
          .where(eq(t.inventoryItems.id, existingRes.itemId));
      }

      await db
        .update(t.orderLines)
        .set({
          quantityUnits: newQuantity,
          reservedUnits: orderLine.reservedUnits - excessReserved,
        })
        .where(eq(t.orderLines.id, orderLine.id));
    } else {
      await db
        .update(t.orderLines)
        .set({ quantityUnits: newQuantity })
        .where(eq(t.orderLines.id, orderLine.id));
    }
  }

  await db
    .update(t.customerOrders)
    .set({ dueAt, priority: parsed.data.priority, notes: parsed.data.notes ?? null })
    .where(eq(t.customerOrders.id, order.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'order.update',
    entityType: 'customer_order',
    entityId: order.id,
    entityLabel: `Commande #${order.number}`,
    previousValue: {
      quantityUnits: orderLine.quantityUnits,
      dueAt: order.dueAt,
      priority: order.priority,
      notes: order.notes,
    },
    newValue: {
      quantityUnits: newQuantity,
      dueAt,
      priority: parsed.data.priority,
      notes: parsed.data.notes ?? null,
    },
  });

  revalidatePath(`/commandes/${order.id}`);
  revalidatePath('/commandes');
  revalidatePath('/stocks');

  redirect(`/commandes/${order.id}`);
}

const prioritySchema = z.object({
  orderId: z.uuid(),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
});

/** Changement de priorité — modification sensible, donc tracée. */
export async function updateOrderPriorityAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('orders:write');

  const parsed = prioritySchema.safeParse({
    orderId: formData.get('orderId'),
    priority: formData.get('priority'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [order] = await db
    .select()
    .from(t.customerOrders)
    .where(eq(t.customerOrders.id, parsed.data.orderId))
    .limit(1);
  if (!order) return { ok: false, message: 'Commande introuvable.' };

  await db
    .update(t.customerOrders)
    .set({ priority: parsed.data.priority })
    .where(eq(t.customerOrders.id, order.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'order.priority_change',
    entityType: 'customer_order',
    entityId: order.id,
    entityLabel: `Commande #${order.number}`,
    previousValue: { priority: order.priority },
    newValue: { priority: parsed.data.priority },
  });

  revalidatePath(`/commandes/${order.id}`);
  revalidatePath('/commandes');

  return { ok: true, message: 'Priorité mise à jour.' };
}
