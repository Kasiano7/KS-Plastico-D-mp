import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  machineEventTypeEnum,
  machineStatusEnum,
  moldStatusEnum,
  telemetrySourceEnum,
} from './enums';
import { machinePhotos } from './machine-photos';

/** Un atelier regroupe des machines et une équipe. */
export const workshops = pgTable('workshops', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  /** Objectif de production journalier en pièces, sert au calcul de performance. */
  dailyTargetUnits: integer('daily_target_units').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const materials = pgTable('materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  /** Famille matière : PP, ABS, PEHD… */
  family: text('family').notNull(),
  color: text('color'),
  /** Coût matière en centimes d'euro par kilogramme. */
  costCentsPerKg: integer('cost_cents_per_kg').notNull().default(0),
  supplierId: uuid('supplier_id'),
});

export const molds = pgTable(
  'molds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    name: text('name').notNull(),
    status: moldStatusEnum('status').notNull().default('available'),
    location: text('location'),
    /** Nombre d'empreintes du moule. */
    cavities: integer('cavities').notNull().default(1),
    /** Durée standard d'un changement de moule, en minutes (§20). */
    changeoverMinutes: integer('changeover_minutes').notNull().default(180),
    cyclesSinceMaintenance: integer('cycles_since_maintenance').notNull().default(0),
    maintenanceEveryCycles: integer('maintenance_every_cycles').notNull().default(200000),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('molds_status_idx').on(t.status)],
);

export const machines = pgTable(
  'machines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    /**
     * Identité de l'actif correspondant (§ schema/assets).
     *
     * Une presse est un actif comme un autre : `assets` porte ce qui est
     * commun à tout ce qu'on entretient, `machines` ce qui est propre à une
     * presse à injection. La colonne est nullable le temps de la migration ;
     * le remplissage est fait par la migration elle-même, et toute presse
     * créée ensuite reçoit son actif dans la même transaction.
     */
    assetId: uuid('asset_id').unique(),
    workshopId: uuid('workshop_id')
      .notNull()
      .references(() => workshops.id),
    /** Tonnage de la presse (ex. 1000T). */
    tonnage: integer('tonnage').notNull().default(0),
    manufacturer: text('manufacturer'),
    model: text('model'),
    status: machineStatusEnum('status').notNull().default('idle'),
    statusSince: timestamp('status_since', { withTimezone: true }).notNull().defaultNow(),
    /** Moule actuellement monté sur la presse. */
    currentMoldId: uuid('current_mold_id').references(() => molds.id),
    /** Coût horaire machine en centimes (énergie + amortissement + main d'œuvre). */
    hourlyCostCents: integer('hourly_cost_cents').notNull().default(0),
    /** Disponibilité théorique en heures par jour. */
    dailyCapacityHours: real('daily_capacity_hours').notNull().default(21),

    /*
     * Plaque signalétique — renseignée à la mise en service, jamais calculée.
     * Nullable : une machine peut être créée avant que sa fiche constructeur
     * ne soit saisie. L'interface affiche « — » plutôt qu'une valeur inventée.
     */
    serialNumber: text('serial_number'),
    manufacturingYear: integer('manufacturing_year'),
    /** Compteur constructeur, en heures. */
    totalHours: integer('total_hours'),
    /** Part du compteur passée en production, en heures. */
    productionHours: integer('production_hours'),
    controlSoftware: text('control_software'),
    controlSoftwareVersion: text('control_software_version'),

    /**
     * Photo choisie manuellement (§ machine-photos.ts) — prioritaire sur
     * l'illustration générique déduite du fabricant. `set null` en cascade :
     * la suppression d'une photo ne doit jamais faire disparaître une
     * machine, seulement la faire retomber sur l'illustration générique.
     */
    photoId: uuid('photo_id').references(() => machinePhotos.id, { onDelete: 'set null' }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('machines_workshop_idx').on(t.workshopId),
    index('machines_status_idx').on(t.status),
  ],
);

/**
 * Journal d'événements machine : reconstruit une journée à la minute près (§30).
 * Table volumineuse par nature — jamais chargée intégralement côté client.
 */
export const machineEvents = pgTable(
  'machine_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    type: machineEventTypeEnum('type').notNull(),
    status: machineStatusEnum('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes'),
    reason: text('reason'),
    productionOrderId: uuid('production_order_id'),
    source: telemetrySourceEnum('source').notNull().default('simulated'),
    metadata: jsonb('metadata'),
  },
  (t) => [
    index('machine_events_machine_start_idx').on(t.machineId, t.startedAt),
    index('machine_events_type_idx').on(t.type),
  ],
);

/**
 * Télémétrie haute fréquence — volontairement séparée des données métier (§44).
 * Alimentée par un MachineTelemetryProvider (simulé en V1, passerelle plus tard).
 */
export const machineTelemetry = pgTable(
  'machine_telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    cycleTimeSeconds: real('cycle_time_seconds'),
    partsProduced: integer('parts_produced').notNull().default(0),
    partsRejected: integer('parts_rejected').notNull().default(0),
    availabilityPct: real('availability_pct'),
    performancePct: real('performance_pct'),
    qualityPct: real('quality_pct'),
    source: telemetrySourceEnum('source').notNull().default('simulated'),
  },
  (t) => [
    index('machine_telemetry_machine_time_idx').on(t.machineId, t.recordedAt),
    uniqueIndex('machine_telemetry_machine_recorded_unique').on(t.machineId, t.recordedAt),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    name: text('name').notNull(),
    family: text('family').notNull(),
    customerId: uuid('customer_id'),
    materialId: uuid('material_id').references(() => materials.id),
    moldId: uuid('mold_id').references(() => molds.id),
    imageUrl: text('image_url'),
    description: text('description'),
    /** Poids unitaire en grammes. */
    weightGrams: integer('weight_grams').notNull().default(0),
    dimensionsMm: text('dimensions_mm'),
    /** Temps de cycle théorique en secondes pour une empreinte pleine. */
    cycleTimeSeconds: real('cycle_time_seconds').notNull().default(60),
    /** Nombre de pièces par palette — pilote toute la logistique. */
    unitsPerPallet: integer('units_per_pallet').notNull().default(100),
    /** Coût de revient calculé (centimes) — recalculé par CostModel. */
    unitCostCents: integer('unit_cost_cents').notNull().default(0),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('products_family_idx').on(t.family), index('products_customer_idx').on(t.customerId)],
);

/**
 * Compatibilité pièce ↔ machine (§19). Une pièce ne peut être planifiée que sur
 * une machine listée ici, avec sa cadence propre.
 */
export const productMachines = pgTable(
  'product_machines',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    /** Cadence réaliste sur cette machine, en pièces/heure. */
    unitsPerHour: real('units_per_hour').notNull(),
    isPreferred: boolean('is_preferred').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.productId, t.machineId] })],
);

/** Compatibilité moule ↔ machine. */
export const moldMachines = pgTable(
  'mold_machines',
  {
    moldId: uuid('mold_id')
      .notNull()
      .references(() => molds.id, { onDelete: 'cascade' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.moldId, t.machineId] })],
);

/** Modèle de coût utilisé pour convertir un problème industriel en euros (§16, §33). */
export const costModels = pgTable('cost_models', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  energyCentsPerHour: integer('energy_cents_per_hour').notNull().default(0),
  laborCentsPerHour: integer('labor_cents_per_hour').notNull().default(0),
  overheadCentsPerHour: integer('overhead_cents_per_hour').notNull().default(0),
  consumablesCentsPerHour: integer('consumables_cents_per_hour').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
});

export const workshopsRelations = relations(workshops, ({ many }) => ({
  machines: many(machines),
}));

export const machinesRelations = relations(machines, ({ one, many }) => ({
  workshop: one(workshops, { fields: [machines.workshopId], references: [workshops.id] }),
  currentMold: one(molds, { fields: [machines.currentMoldId], references: [molds.id] }),
  events: many(machineEvents),
  productMachines: many(productMachines),
}));

export const machineEventsRelations = relations(machineEvents, ({ one }) => ({
  machine: one(machines, { fields: [machineEvents.machineId], references: [machines.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  material: one(materials, { fields: [products.materialId], references: [materials.id] }),
  mold: one(molds, { fields: [products.moldId], references: [molds.id] }),
  productMachines: many(productMachines),
}));

export const productMachinesRelations = relations(productMachines, ({ one }) => ({
  product: one(products, { fields: [productMachines.productId], references: [products.id] }),
  machine: one(machines, { fields: [productMachines.machineId], references: [machines.id] }),
}));

export const moldsRelations = relations(molds, ({ many }) => ({
  moldMachines: many(moldMachines),
  products: many(products),
}));

export const moldMachinesRelations = relations(moldMachines, ({ one }) => ({
  mold: one(molds, { fields: [moldMachines.moldId], references: [molds.id] }),
  machine: one(machines, { fields: [moldMachines.machineId], references: [machines.id] }),
}));
