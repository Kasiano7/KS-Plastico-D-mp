'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type DocumentActionState = { ok?: boolean; message?: string };

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const uploadSchema = z.object({
  machineId: z.uuid(),
  category: z.enum(t.machineDocumentCategoryEnum.enumValues).default('autre'),
});

/**
 * Dépôt d'un document machine (§ documents).
 * Le contenu est encodé en base64 et stocké en base : aucun stockage
 * externe n'est requis pour faire fonctionner l'application.
 */
export async function uploadMachineDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('machines:write');

  const parsed = uploadSchema.safeParse({
    machineId: formData.get('machineId'),
    category: formData.get('category') || 'autre',
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Sélectionnez un fichier.' };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, message: 'Fichier trop volumineux (5 Mo maximum).' };
  }
  if (file.type && !ACCEPTED_TYPES.has(file.type)) {
    return { ok: false, message: 'Type de fichier non pris en charge (PDF, image, Office, texte).' };
  }

  const db = await getDb();
  const [machine] = await db
    .select({ id: t.machines.id, name: t.machines.name })
    .from(t.machines)
    .where(eq(t.machines.id, parsed.data.machineId))
    .limit(1);
  if (!machine) return { ok: false, message: 'Machine introuvable.' };

  const contentBase64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  const [document] = await db
    .insert(t.machineDocuments)
    .values({
      machineId: machine.id,
      category: parsed.data.category,
      fileName: file.name || 'document',
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      contentBase64,
      uploadedBy: user.id,
      uploadedByLabel: user.fullName,
    })
    .returning();

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'machine.document_upload',
    entityType: 'machine_document',
    entityId: document.id,
    entityLabel: `${machine.name} — ${document.fileName}`,
    newValue: { category: document.category, sizeBytes: document.sizeBytes },
  });

  revalidatePath(`/machines/${machine.id}/documents`);
  return { ok: true, message: `« ${document.fileName} » ajouté.` };
}

const deleteSchema = z.object({ documentId: z.uuid() });

export async function deleteMachineDocumentAction(
  _state: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('machines:write');

  const parsed = deleteSchema.safeParse({ documentId: formData.get('documentId') });
  if (!parsed.success) return { ok: false, message: 'Document invalide.' };

  const db = await getDb();
  const [document] = await db
    .select()
    .from(t.machineDocuments)
    .where(eq(t.machineDocuments.id, parsed.data.documentId))
    .limit(1);
  if (!document) return { ok: false, message: 'Document introuvable.' };

  await db.delete(t.machineDocuments).where(eq(t.machineDocuments.id, document.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'machine.document_delete',
    entityType: 'machine_document',
    entityId: document.id,
    entityLabel: document.fileName,
    previousValue: { category: document.category, sizeBytes: document.sizeBytes },
  });

  revalidatePath(`/machines/${document.machineId}/documents`);
  return { ok: true, message: `« ${document.fileName} » supprimé.` };
}
