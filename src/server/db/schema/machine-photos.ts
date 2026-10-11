import { pgTable, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Photothèque des presses — indépendante de `machineDocuments` (notices,
 * plans…) : une photo est réutilisable par PLUSIEURS machines du même
 * modèle, un document ne l'est jamais. `machines.photoId` pointe ici ;
 * cette table ne référence jamais `machines` en retour, pour ne pas créer de
 * dépendance circulaire entre fichiers de schéma.
 *
 * Contenu en base64 en base, comme `machineDocuments` : aucun stockage
 * externe requis pour faire fonctionner l'application.
 */
export const machinePhotos = pgTable('machine_photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentBase64: text('content_base64').notNull(),
  uploadedBy: uuid('uploaded_by'),
  uploadedByLabel: text('uploaded_by_label'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
