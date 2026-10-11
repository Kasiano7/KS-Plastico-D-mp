import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { inventoryKindEnum, movementTypeEnum, reservationStatusEnum, severityEnum } from './enums';
import { products } from './factory';
import { customerOrders } from './sales';

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  category: text('category'),
  contactEmail: text('contact_email'),
  /** Délai d'approvisionnement moyen en jours — utilisé par le stock prédictif. */
  leadTimeDays: integer('lead_time_days').notNull().default(7),
  reliabilityPct: integer('reliability_pct').notNull().default(95),
});

/**
 * Article de stock. Un article `finished_good` référence un produit ;
 * les palettes, caisses, matières et consommables n'en référencent aucun.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    kind: inventoryKindEnum('kind').notNull(),
    unit: text('unit').notNull().default('u'),
    productId: uuid('product_id').references(() => products.id),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    location: text('location'),
    /** Quantité physiquement présente. */
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    /** Quantité déjà promise à une commande — indisponible pour une autre (§17). */
    quantityReserved: integer('quantity_reserved').notNull().default(0),
    /** Stock de sécurité : n'entre pas dans le disponible. */
    safetyStock: integer('safety_stock').notNull().default(0),
    reorderPoint: integer('reorder_point').notNull().default(0),
    /** Consommation moyenne journalière, base de la projection de rupture (§27). */
    averageDailyConsumption: integer('average_daily_consumption').notNull().default(0),
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_items_kind_idx').on(t.kind),
    index('inventory_items_product_idx').on(t.productId),
  ],
);

export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    type: movementTypeEnum('type').notNull(),
    /** Signé : positif pour une entrée, négatif pour une sortie. */
    quantity: integer('quantity').notNull(),
    quantityAfter: integer('quantity_after').notNull(),
    reference: text('reference'),
    customerOrderId: uuid('customer_order_id').references(() => customerOrders.id),
    userId: uuid('user_id'),
    note: text('note'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('inventory_movements_item_time_idx').on(t.itemId, t.occurredAt),
    index('inventory_movements_type_idx').on(t.type),
  ],
);

/** Réservation ferme de stock au profit d'une commande (§17). */
export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    customerOrderId: uuid('customer_order_id')
      .notNull()
      .references(() => customerOrders.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    status: reservationStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [
    index('inventory_reservations_item_idx').on(t.itemId),
    index('inventory_reservations_order_idx').on(t.customerOrderId),
  ],
);

/** Besoin d'achat détecté par le stock prédictif (§27) — proposition, jamais commande automatique. */
export const purchaseRequirements = pgTable(
  'purchase_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    severity: severityEnum('severity').notNull().default('warning'),
    requiredQuantity: integer('required_quantity').notNull(),
    recommendedQuantity: integer('recommended_quantity').notNull(),
    /** Date au-delà de laquelle la commande arrivera trop tard. */
    orderByAt: timestamp('order_by_at', { withTimezone: true }).notNull(),
    projectedShortageAt: timestamp('projected_shortage_at', { withTimezone: true }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('purchase_requirements_item_idx').on(t.itemId)],
);

export const inventoryItemsRelations = relations(inventoryItems, ({ one, many }) => ({
  product: one(products, { fields: [inventoryItems.productId], references: [products.id] }),
  supplier: one(suppliers, { fields: [inventoryItems.supplierId], references: [suppliers.id] }),
  movements: many(inventoryMovements),
  reservations: many(inventoryReservations),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({ one }) => ({
  item: one(inventoryItems, { fields: [inventoryMovements.itemId], references: [inventoryItems.id] }),
}));

export const inventoryReservationsRelations = relations(inventoryReservations, ({ one }) => ({
  item: one(inventoryItems, {
    fields: [inventoryReservations.itemId],
    references: [inventoryItems.id],
  }),
  customerOrder: one(customerOrders, {
    fields: [inventoryReservations.customerOrderId],
    references: [customerOrders.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  items: many(inventoryItems),
}));
