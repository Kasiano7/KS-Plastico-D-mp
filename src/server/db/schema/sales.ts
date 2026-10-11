import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { orderPriorityEnum, orderStatusEnum } from './enums';
import { products } from './factory';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  country: text('country'),
  contactEmail: text('contact_email'),
  /** Délai contractuel de livraison en jours ouvrés. */
  leadTimeDays: integer('lead_time_days').notNull().default(15),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const customerOrders = pgTable(
  'customer_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Numéro métier affiché partout dans l'application, ex. `5842`. */
    number: text('number').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    status: orderStatusEnum('status').notNull().default('confirmed'),
    priority: orderPriorityEnum('priority').notNull().default('normal'),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull().defaultNow(),
    /** Date souhaitée par le client — base de tout calcul de risque de retard. */
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    shippedAt: timestamp('shipped_at', { withTimezone: true }),
    notes: text('notes'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('customer_orders_status_idx').on(t.status),
    index('customer_orders_due_idx').on(t.dueAt),
    index('customer_orders_customer_idx').on(t.customerId),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => customerOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    quantityUnits: integer('quantity_units').notNull(),
    /** Quantité couverte par du stock déjà réservé. */
    reservedUnits: integer('reserved_units').notNull().default(0),
    /** Quantité réellement produite et affectée à la commande. */
    producedUnits: integer('produced_units').notNull().default(0),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId), index('order_lines_product_idx').on(t.productId)],
);

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(customerOrders),
}));

export const customerOrdersRelations = relations(customerOrders, ({ one, many }) => ({
  customer: one(customers, { fields: [customerOrders.customerId], references: [customers.id] }),
  lines: many(orderLines),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(customerOrders, { fields: [orderLines.orderId], references: [customerOrders.id] }),
  product: one(products, { fields: [orderLines.productId], references: [products.id] }),
}));
