import 'server-only';

import { inArray } from 'drizzle-orm';
import type { CatalogImportDraft } from '@/lib/catalog-import';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';

export async function markCatalogDuplicates(
  drafts: Omit<CatalogImportDraft, 'duplicate'>[],
): Promise<CatalogImportDraft[]> {
  const references = [...new Set(drafts.map((draft) => draft.reference.trim().toUpperCase()))];
  if (references.length === 0) return [];

  const db = await getDb();
  const existing = await db
    .select({ reference: t.products.reference })
    .from(t.products)
    .where(inArray(t.products.reference, references));
  const existingSet = new Set(existing.map((row) => row.reference.toUpperCase()));
  const seen = new Set<string>();

  return drafts.map((draft) => {
    const reference = draft.reference.trim().toUpperCase();
    const duplicate = existingSet.has(reference) || seen.has(reference);
    seen.add(reference);
    return {
      ...draft,
      reference,
      duplicate,
      issues: duplicate
        ? [...draft.issues, 'Cette référence existe déjà ou apparaît plusieurs fois dans le fichier.']
        : draft.issues,
    };
  });
}
