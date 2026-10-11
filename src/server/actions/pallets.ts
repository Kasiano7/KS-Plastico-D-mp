'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { assertAnyPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { canCancelPallet } from '../domain/pallets';

export type ActionState = { ok?: boolean; message?: string; palletCode?: string };

const completeSchema = z.object({
  productionOrderId: z.uuid(),
  quantityUnits: z.coerce.number().int().min(1).max(100_000),
});

/**
 * Fin de palette (§26).
 *
 * Une seule action déclenche toute la chaîne :
 *   palette clôturée → code QR généré → stock produit fini crédité →
 *   palette Europe consommée → avancement de la commande mis à jour →
 *   mouvement de stock et journal d'audit écrits.
 */
export async function completePalletAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAnyPermission(['workstation:use', 'production:write']);

  const parsed = completeSchema.safeParse({
    productionOrderId: formData.get('productionOrderId'),
    quantityUnits: formData.get('quantityUnits'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const now = new Date();

  const [productionOrder] = await db
    .select({
      order: t.productionOrders,
      productName: t.products.name,
      productId: t.products.id,
      unitsPerPallet: t.products.unitsPerPallet,
      orderNumber: t.customerOrders.number,
      orderId: t.customerOrders.id,
    })
    .from(t.productionOrders)
    .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
    .leftJoin(t.customerOrders, eq(t.productionOrders.customerOrderId, t.customerOrders.id))
    .where(eq(t.productionOrders.id, parsed.data.productionOrderId))
    .limit(1);

  if (!productionOrder) return { ok: false, message: 'Ordre de fabrication introuvable.' };

  const lot = `L${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const code = `PAL-${productionOrder.orderNumber ?? productionOrder.order.number}-${String(now.getTime() % 100000).padStart(5, '0')}`;

  const [pallet] = await db
    .insert(t.pallets)
    .values({
      code,
      productId: productionOrder.productId,
      productionOrderId: productionOrder.order.id,
      customerOrderId: productionOrder.order.customerOrderId,
      machineId: productionOrder.order.machineId,
      operatorId: user.employeeId,
      status: 'in_stock',
      quantityUnits: parsed.data.quantityUnits,
      lotNumber: `${lot}-${productionOrder.order.number}`,
      location: 'Zone produits finis',
      completedAt: now,
    })
    .returning();

  // Avancement de l'ordre de fabrication et de la ligne de commande.
  await db
    .update(t.productionOrders)
    .set({ producedUnits: sql`${t.productionOrders.producedUnits} + ${parsed.data.quantityUnits}` })
    .where(eq(t.productionOrders.id, productionOrder.order.id));

  if (productionOrder.order.orderLineId) {
    await db
      .update(t.orderLines)
      .set({ producedUnits: sql`${t.orderLines.producedUnits} + ${parsed.data.quantityUnits}` })
      .where(eq(t.orderLines.id, productionOrder.order.orderLineId));
  }

  // Entrée en stock produit fini.
  const [stockItem] = await db
    .select()
    .from(t.inventoryItems)
    .where(
      and(
        eq(t.inventoryItems.productId, productionOrder.productId),
        eq(t.inventoryItems.kind, 'finished_good'),
      ),
    )
    .limit(1);

  if (stockItem) {
    const quantityAfter = stockItem.quantityOnHand + parsed.data.quantityUnits;
    await db
      .update(t.inventoryItems)
      .set({ quantityOnHand: quantityAfter, updatedAt: now })
      .where(eq(t.inventoryItems.id, stockItem.id));

    await db.insert(t.inventoryMovements).values({
      itemId: stockItem.id,
      type: 'production_output',
      quantity: parsed.data.quantityUnits,
      quantityAfter,
      reference: pallet.code,
      customerOrderId: productionOrder.order.customerOrderId,
      userId: user.id,
      note: `Palette ${pallet.code} déclarée sur ${productionOrder.order.number}`,
      occurredAt: now,
    });
  }

  // Consommation d'une palette Europe.
  const [palletStock] = await db
    .select()
    .from(t.inventoryItems)
    .where(eq(t.inventoryItems.sku, 'PAL-EUR-1208'))
    .limit(1);

  if (palletStock && palletStock.quantityOnHand > 0) {
    const quantityAfter = palletStock.quantityOnHand - 1;
    await db
      .update(t.inventoryItems)
      .set({ quantityOnHand: quantityAfter, updatedAt: now })
      .where(eq(t.inventoryItems.id, palletStock.id));

    await db.insert(t.inventoryMovements).values({
      itemId: palletStock.id,
      type: 'consumption',
      quantity: -1,
      quantityAfter,
      reference: pallet.code,
      userId: user.id,
      note: 'Palettisation',
      occurredAt: now,
    });
  }

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'pallet.complete',
    entityType: 'pallet',
    entityId: pallet.id,
    entityLabel: pallet.code,
    newValue: {
      quantityUnits: parsed.data.quantityUnits,
      productionOrder: productionOrder.order.number,
      customerOrder: productionOrder.orderNumber,
      lot: pallet.lotNumber,
    },
  });

  revalidatePath('/poste');
  revalidatePath('/stocks');
  revalidatePath('/commandes');
  if (productionOrder.orderId) revalidatePath(`/commandes/${productionOrder.orderId}`);
  revalidatePath('/');

  return {
    ok: true,
    message: `Palette ${pallet.code} enregistrée : ${parsed.data.quantityUnits} pièces en stock.`,
    palletCode: pallet.code,
  };
}

const cancelSchema = z.object({
  palletId: z.uuid(),
  justification: z.string().trim().min(5, 'Expliquez brièvement l’erreur.').max(300),
});

/**
 * Annulation d'une palette déclarée par erreur.
 *
 * Une palette déjà affectée ou expédiée n'est plus corrigeable ici : elle a
 * quitté le contrôle de l'opérateur et doit passer par un ajustement de stock
 * documenté, pas par une annulation silencieuse. Défait exactement les
 * mouvements de `completePalletAction` — rien de plus, rien de moins.
 */
export async function cancelPalletAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAnyPermission(['workstation:use', 'production:write']);

  const parsed = cancelSchema.safeParse({
    palletId: formData.get('palletId'),
    justification: formData.get('justification'),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Requête invalide.' };
  }

  const db = await getDb();
  const now = new Date();

  const [pallet] = await db
    .select()
    .from(t.pallets)
    .where(eq(t.pallets.id, parsed.data.palletId))
    .limit(1);
  if (!pallet) return { ok: false, message: 'Palette introuvable.' };

  if (!canCancelPallet(pallet.status)) {
    return {
      ok: false,
      message:
        'Cette palette a déjà été allouée ou expédiée : elle ne peut plus être annulée depuis le poste.',
    };
  }

  const previousStatus = pallet.status;

  // Retire les pièces du stock produit fini.
  const [stockItem] = await db
    .select()
    .from(t.inventoryItems)
    .where(
      and(eq(t.inventoryItems.productId, pallet.productId), eq(t.inventoryItems.kind, 'finished_good')),
    )
    .limit(1);

  if (stockItem) {
    const quantityAfter = stockItem.quantityOnHand - pallet.quantityUnits;
    await db
      .update(t.inventoryItems)
      .set({ quantityOnHand: quantityAfter, updatedAt: now })
      .where(eq(t.inventoryItems.id, stockItem.id));

    await db.insert(t.inventoryMovements).values({
      itemId: stockItem.id,
      type: 'adjustment',
      quantity: -pallet.quantityUnits,
      quantityAfter,
      reference: pallet.code,
      customerOrderId: pallet.customerOrderId,
      userId: user.id,
      note: `Annulation palette ${pallet.code} — ${parsed.data.justification}`,
      occurredAt: now,
    });
  }

  // Rend la palette Europe consommée à tort.
  const [palletStock] = await db
    .select()
    .from(t.inventoryItems)
    .where(eq(t.inventoryItems.sku, 'PAL-EUR-1208'))
    .limit(1);

  if (palletStock) {
    const quantityAfter = palletStock.quantityOnHand + 1;
    await db
      .update(t.inventoryItems)
      .set({ quantityOnHand: quantityAfter, updatedAt: now })
      .where(eq(t.inventoryItems.id, palletStock.id));

    await db.insert(t.inventoryMovements).values({
      itemId: palletStock.id,
      type: 'adjustment',
      quantity: 1,
      quantityAfter,
      reference: pallet.code,
      userId: user.id,
      note: `Annulation palette ${pallet.code}`,
      occurredAt: now,
    });
  }

  // Retire l'avancement de l'ordre de fabrication et de la ligne de commande.
  if (pallet.productionOrderId) {
    await db
      .update(t.productionOrders)
      .set({ producedUnits: sql`greatest(${t.productionOrders.producedUnits} - ${pallet.quantityUnits}, 0)` })
      .where(eq(t.productionOrders.id, pallet.productionOrderId));

    const [productionOrder] = await db
      .select({ orderLineId: t.productionOrders.orderLineId })
      .from(t.productionOrders)
      .where(eq(t.productionOrders.id, pallet.productionOrderId))
      .limit(1);

    if (productionOrder?.orderLineId) {
      await db
        .update(t.orderLines)
        .set({
          producedUnits: sql`greatest(${t.orderLines.producedUnits} - ${pallet.quantityUnits}, 0)`,
        })
        .where(eq(t.orderLines.id, productionOrder.orderLineId));
    }
  }

  await db
    .update(t.pallets)
    .set({ status: 'cancelled' })
    .where(eq(t.pallets.id, pallet.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'pallet.cancel',
    entityType: 'pallet',
    entityId: pallet.id,
    entityLabel: pallet.code,
    previousValue: { status: previousStatus, quantityUnits: pallet.quantityUnits },
    newValue: { status: 'cancelled' },
    justification: parsed.data.justification,
  });

  revalidatePath('/poste');
  revalidatePath('/stocks');
  revalidatePath('/commandes');
  revalidatePath('/');

  return { ok: true, message: `Palette ${pallet.code} annulée : stock et avancement corrigés.` };
}
