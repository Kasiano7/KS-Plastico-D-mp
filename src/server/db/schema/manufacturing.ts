import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { palletStatusEnum, productionOrderStatusEnum } from './enums';
import { machines, molds, products } from './factory';
import { customerOrders, orderLines } from './sales';

/**
 * Ordre de fabrication : le pont entre une commande client et une machine.
 * C'est l'objet central du planning (§19) et du poste opérateur (§8).
 */
export const productionOrders = pgTable(
  'production_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    orderLineId: uuid('order_line_id').references(() => orderLines.id, { onDelete: 'set null' }),
    customerOrderId: uuid('customer_order_id').references(() => customerOrders.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    machineId: uuid('machine_id').references(() => machines.id),
    moldId: uuid('mold_id').references(() => molds.id),
    status: productionOrderStatusEnum('status').notNull().default('planned'),
    quantityUnits: integer('quantity_units').notNull(),
    producedUnits: integer('produced_units').notNull().default(0),
    rejectedUnits: integer('rejected_units').notNull().default(0),
    /** Créneau planifié — sert au Gantt et au calcul de capacité. */
    plannedStartAt: timestamp('planned_start_at', { withTimezone: true }).notNull(),
    plannedEndAt: timestamp('planned_end_at', { withTimezone: true }).notNull(),
    actualStartAt: timestamp('actual_start_at', { withTimezone: true }),
    actualEndAt: timestamp('actual_end_at', { withTimezone: true }),
    /** Cadence retenue au moment de la planification (pièces/heure). */
    plannedUnitsPerHour: real('planned_units_per_hour').notNull(),
    requiresMoldChange: text('requires_mold_change'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('production_orders_machine_start_idx').on(t.machineId, t.plannedStartAt),
    index('production_orders_status_idx').on(t.status),
    index('production_orders_customer_order_idx').on(t.customerOrderId),
  ],
);

/** Une session de production continue (une équipe, un opérateur). */
export const productionRuns = pgTable(
  'production_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id),
    operatorId: uuid('operator_id'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    goodUnits: integer('good_units').notNull().default(0),
    rejectedUnits: integer('rejected_units').notNull().default(0),
    downtimeMinutes: integer('downtime_minutes').notNull().default(0),
  },
  (t) => [index('production_runs_order_idx').on(t.productionOrderId)],
);

/**
 * Palette physique tracée par QR code (§26). Porte la traçabilité complète :
 * pièce, quantité, machine, opérateur, lot, commande.
 */
export const pallets = pgTable(
  'pallets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productionOrderId: uuid('production_order_id').references(() => productionOrders.id),
    /** Commande à laquelle la palette est affectée une fois en stock. */
    customerOrderId: uuid('customer_order_id').references(() => customerOrders.id),
    machineId: uuid('machine_id').references(() => machines.id),
    operatorId: uuid('operator_id'),
    status: palletStatusEnum('status').notNull().default('in_progress'),
    quantityUnits: integer('quantity_units').notNull().default(0),
    lotNumber: text('lot_number'),
    location: text('location'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pallets_status_idx').on(t.status),
    index('pallets_order_idx').on(t.customerOrderId),
    index('pallets_product_idx').on(t.productId),
  ],
);

export const productionOrdersRelations = relations(productionOrders, ({ one, many }) => ({
  product: one(products, { fields: [productionOrders.productId], references: [products.id] }),
  machine: one(machines, { fields: [productionOrders.machineId], references: [machines.id] }),
  mold: one(molds, { fields: [productionOrders.moldId], references: [molds.id] }),
  customerOrder: one(customerOrders, {
    fields: [productionOrders.customerOrderId],
    references: [customerOrders.id],
  }),
  runs: many(productionRuns),
  pallets: many(pallets),
}));

export const productionRunsRelations = relations(productionRuns, ({ one }) => ({
  productionOrder: one(productionOrders, {
    fields: [productionRuns.productionOrderId],
    references: [productionOrders.id],
  }),
  machine: one(machines, { fields: [productionRuns.machineId], references: [machines.id] }),
}));

export const palletsRelations = relations(pallets, ({ one }) => ({
  product: one(products, { fields: [pallets.productId], references: [products.id] }),
  productionOrder: one(productionOrders, {
    fields: [pallets.productionOrderId],
    references: [productionOrders.id],
  }),
  customerOrder: one(customerOrders, {
    fields: [pallets.customerOrderId],
    references: [customerOrders.id],
  }),
  machine: one(machines, { fields: [pallets.machineId], references: [machines.id] }),
}));
