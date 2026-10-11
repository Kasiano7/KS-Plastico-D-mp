import 'server-only';

import { desc } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';

export type MachinePhotoSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

/** Métadonnées seules — jamais le contenu base64, trop lourd pour une galerie. */
export async function listMachinePhotos(): Promise<MachinePhotoSummary[]> {
  const db = await getDb();
  return db
    .select({
      id: t.machinePhotos.id,
      fileName: t.machinePhotos.fileName,
      mimeType: t.machinePhotos.mimeType,
      sizeBytes: t.machinePhotos.sizeBytes,
    })
    .from(t.machinePhotos)
    .orderBy(desc(t.machinePhotos.uploadedAt));
}
