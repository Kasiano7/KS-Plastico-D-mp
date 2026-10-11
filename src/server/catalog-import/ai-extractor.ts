import 'server-only';

import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import type { CatalogImportDraft } from '@/lib/catalog-import';
import { getRemoteAiConfig } from '@/server/ai/openai-client';

type DraftWithoutDuplicate = Omit<CatalogImportDraft, 'duplicate'>;

const extractionSchema = z.object({
  items: z.array(
    z.object({
      reference: z.string().max(100),
      name: z.string().max(250),
      family: z.string().max(120),
      description: z.string().max(2000),
      weightGrams: z.number().min(0).max(10_000_000),
      dimensionsMm: z.string().max(160),
      cycleTimeSeconds: z.number().min(0).max(86_400),
      unitsPerPallet: z.number().int().min(0).max(1_000_000),
      confidence: z.number().min(0).max(1),
      issues: z.array(z.string().max(200)).max(8),
    }),
  ).max(200),
});

function normalizeItems(items: z.infer<typeof extractionSchema>['items']): DraftWithoutDuplicate[] {
  return items
    .filter((item) => item.reference.trim())
    .map((item, index) => {
      const reference = item.reference.trim().toUpperCase();
      const issues = [...item.issues];
      if (!item.name.trim()) issues.push('Désignation absente : référence utilisée comme nom.');
      if (!item.family.trim()) issues.push('Famille absente : valeur « À classer » proposée.');

      return {
        tempId: `ai-${index + 1}`,
        reference,
        name: item.name.trim() || reference,
        family: item.family.trim() || 'À classer',
        description: item.description.trim(),
        weightGrams: Math.round(item.weightGrams),
        dimensionsMm: item.dimensionsMm.trim(),
        cycleTimeSeconds: item.cycleTimeSeconds > 0 ? item.cycleTimeSeconds : 60,
        unitsPerPallet: item.unitsPerPallet > 0 ? item.unitsPerPallet : 100,
        confidence: item.confidence,
        issues,
        sourceRow: null,
      };
    });
}

async function extract(content: Parameters<NonNullable<ReturnType<typeof getRemoteAiConfig>>['client']['responses']['parse']>[0]['input']) {
  const config = getRemoteAiConfig();
  if (!config) throw new Error("La lecture de photos nécessite d'abord une clé OpenAI ou Azure OpenAI.");

  const response = await config.client.responses.parse({
    model: config.defaultModel,
    store: false,
    input: content,
    text: { format: zodTextFormat(extractionSchema, 'catalog_import') },
  });
  if (!response.output_parsed) throw new Error("L'IA n'a détecté aucune donnée exploitable.");
  return normalizeItems(response.output_parsed.items);
}

export async function extractCatalogFromImage(buffer: Buffer, mimeType: string) {
  return extract([
    {
      role: 'system',
      content:
        "Tu extrais des références industrielles pour KS Plastico Demo. Lis uniquement les informations réellement visibles. N'invente jamais une référence ni une valeur. Utilise une chaîne vide ou 0 si une donnée manque et explique l'incertitude dans issues. Les poids sont en grammes et les temps de cycle en secondes.",
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Extrais toutes les références visibles de cette image et prépare leur import dans le catalogue.',
        },
        {
          type: 'input_image',
          image_url: `data:${mimeType};base64,${buffer.toString('base64')}`,
          detail: 'high',
        },
      ],
    },
  ]);
}

export async function extractCatalogFromRows(rows: string[][]) {
  return extract([
    {
      role: 'system',
      content:
        "Tu transformes un tableau industriel en références du catalogue KS Plastico Demo. N'invente jamais de référence. Déduis seulement la correspondance des colonnes. Utilise une chaîne vide ou 0 si une donnée manque et indique les incertitudes dans issues.",
    },
    {
      role: 'user',
      content: `Voici les lignes du fichier :\n${JSON.stringify(rows.slice(0, 200))}`,
    },
  ]);
}
