import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { summarizeDocumentLibrary, type DocumentLibrarySummary } from '../domain/documents';

export type DocumentLibraryEntry = {
  id: string;
  machineId: string;
  machineName: string;
  machineCode: string;
  workshopName: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedByLabel: string | null;
};

export type DocumentLibrary = {
  entries: DocumentLibraryEntry[];
  summary: DocumentLibrarySummary;
};

/**
 * Bibliothèque documentaire de l'usine.
 *
 * `contentBase64` n'est **jamais** sélectionné : le contenu des fichiers pèse
 * plusieurs mégaoctets et n'a rien à faire dans une liste. Le téléchargement
 * passe par la route dédiée, qui revérifie la permission fichier par fichier.
 */
export async function getDocumentLibrary(): Promise<DocumentLibrary> {
  const db = await getDb();

  const [entries, machines] = await Promise.all([
    db
      .select({
        id: t.machineDocuments.id,
        machineId: t.machineDocuments.machineId,
        machineName: t.machines.name,
        machineCode: t.machines.code,
        workshopName: t.workshops.name,
        category: t.machineDocuments.category,
        fileName: t.machineDocuments.fileName,
        mimeType: t.machineDocuments.mimeType,
        sizeBytes: t.machineDocuments.sizeBytes,
        uploadedAt: t.machineDocuments.uploadedAt,
        uploadedByLabel: t.machineDocuments.uploadedByLabel,
      })
      .from(t.machineDocuments)
      .innerJoin(t.machines, eq(t.machineDocuments.machineId, t.machines.id))
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .orderBy(desc(t.machineDocuments.uploadedAt)),
    db
      .select({
        id: t.machines.id,
        name: t.machines.name,
        code: t.machines.code,
        workshopName: t.workshops.name,
      })
      .from(t.machines)
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id)),
  ]);

  return {
    entries,
    summary: summarizeDocumentLibrary(entries, machines),
  };
}
