import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { demoWriteRefusalResponse } from '@/server/demo/guard';
import { inArray } from 'drizzle-orm';
import { can } from '@/server/domain/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { confirmCatalogImportSchema } from '@/server/catalog-import/schema';
import type { CatalogImportConfirmation } from '@/lib/catalog-import';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const refused = demoWriteRefusalResponse();
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
  if (!can(user.permissions, 'catalog:write')) {
    return NextResponse.json({ error: 'Modification du catalogue non autorisée.' }, { status: 403 });
  }

  const parsed = confirmCatalogImportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 },
    );
  }

  const uniqueItems = new Map(
    parsed.data.items.map((item) => [item.reference.trim().toUpperCase(), item] as const),
  );
  const references = [...uniqueItems.keys()];
  const db = await getDb();
  const existingRows = await db
    .select({ reference: t.products.reference })
    .from(t.products)
    .where(inArray(t.products.reference, references));
  const existing = new Set(existingRows.map((row) => row.reference.toUpperCase()));
  const createdReferences: string[] = [];

  await db.transaction(async (tx) => {
    for (const [reference, item] of uniqueItems) {
      if (existing.has(reference)) continue;
      const [product] = await tx
        .insert(t.products)
        .values({
          reference,
          name: item.name,
          family: item.family,
          description: item.description || null,
          weightGrams: item.weightGrams,
          dimensionsMm: item.dimensionsMm || null,
          cycleTimeSeconds: item.cycleTimeSeconds,
          unitsPerPallet: item.unitsPerPallet,
          isActive: true,
        })
        .onConflictDoNothing({ target: t.products.reference })
        .returning({ id: t.products.id, reference: t.products.reference });

      if (!product) continue;
      createdReferences.push(product.reference);
      await tx.insert(t.auditLogs).values({
        userId: user.id,
        userLabel: user.fullName,
        action: 'catalog.product_import',
        entityType: 'product',
        entityId: product.id,
        entityLabel: `${reference} — ${item.name}`,
        newValue: {
          reference,
          name: item.name,
          family: item.family,
          weightGrams: item.weightGrams,
          dimensionsMm: item.dimensionsMm || null,
          cycleTimeSeconds: item.cycleTimeSeconds,
          unitsPerPallet: item.unitsPerPallet,
        },
        justification: `Import humainement validé depuis ${parsed.data.fileName}`,
      });
    }
  });

  revalidatePath('/catalogue');
  const result: CatalogImportConfirmation = {
    created: createdReferences.length,
    skipped: parsed.data.items.length - createdReferences.length,
    references: createdReferences,
  };
  return NextResponse.json({ result });
}
