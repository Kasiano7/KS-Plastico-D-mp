import { NextResponse } from 'next/server';
import { demoWriteRefusalResponse } from '@/server/demo/guard';
import { can } from '@/server/domain/permissions';
import { getCurrentUser } from '@/server/auth/session';
import { getRemoteAiConfig } from '@/server/ai/openai-client';
import { extractCatalogFromImage, extractCatalogFromRows } from '@/server/catalog-import/ai-extractor';
import { parseSpreadsheet } from '@/server/catalog-import/excel';
import { markCatalogDuplicates } from '@/server/catalog-import/service';
import type { CatalogImportAnalysis } from '@/lib/catalog-import';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  const refused = demoWriteRefusalResponse();
  if (refused) return refused;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });
  if (!can(user.permissions, 'catalog:write')) {
    return NextResponse.json({ error: 'Modification du catalogue non autorisée.' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier requis.' }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Le fichier doit peser moins de 4 Mo et ne pas être vide.' },
        { status: 400 },
      );
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let provider: CatalogImportAnalysis['provider'] = 'local';
    let warnings: string[] = [];
    let extracted;

    if (IMAGE_TYPES.has(file.type)) {
      extracted = await extractCatalogFromImage(buffer, file.type);
      provider = 'openai';
    } else if (extension === 'xlsx' || extension === 'csv') {
      const parsed = await parseSpreadsheet(buffer, extension);
      warnings = parsed.warnings;
      extracted = parsed.drafts;

      if (extracted.length === 0) {
        if (!getRemoteAiConfig()) {
          return NextResponse.json(
            {
              error:
                "La structure du fichier n'a pas été reconnue. Ajoutez une colonne « Référence » ou configurez l'IA pour interpréter les colonnes automatiquement.",
            },
            { status: 422 },
          );
        }
        extracted = await extractCatalogFromRows(parsed.rawRows);
        provider = 'openai';
        warnings.push("Les colonnes ont été interprétées par l'IA : vérifiez attentivement les propositions.");
      }
    } else {
      return NextResponse.json(
        { error: 'Format non pris en charge. Utilisez XLSX, CSV, JPG, PNG ou WEBP.' },
        { status: 415 },
      );
    }

    const drafts = await markCatalogDuplicates(extracted);
    if (drafts.length === 0) {
      return NextResponse.json({ error: "Aucune référence n'a été détectée." }, { status: 422 });
    }

    const analysis: CatalogImportAnalysis = {
      fileName: file.name.slice(0, 255),
      provider,
      drafts,
      warnings,
    };
    return NextResponse.json({ analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "L'analyse du fichier a échoué.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
