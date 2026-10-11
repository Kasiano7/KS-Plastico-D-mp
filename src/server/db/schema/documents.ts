import { relations } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { machines } from './factory';
import { machineDocumentCategoryEnum } from './enums';

/**
 * Document rattaché à une machine (notice, plan, fiche de réglage…).
 *
 * Contenu stocké en base (encodé en base64) plutôt que sur disque : l'app ne
 * dépend d'aucun stockage externe, PGlite embarqué suffit à tout servir.
 */
export const machineDocuments = pgTable(
  'machine_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => machines.id, { onDelete: 'cascade' }),
    category: machineDocumentCategoryEnum('category').notNull().default('autre'),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    contentBase64: text('content_base64').notNull(),
    uploadedBy: uuid('uploaded_by'),
    uploadedByLabel: text('uploaded_by_label'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('machine_documents_machine_idx').on(t.machineId, t.uploadedAt)],
);

export const machineDocumentsRelations = relations(machineDocuments, ({ one }) => ({
  machine: one(machines, { fields: [machineDocuments.machineId], references: [machines.id] }),
}));
