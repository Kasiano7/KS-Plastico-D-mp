import { z } from 'zod';

export const catalogDraftInputSchema = z.object({
  reference: z.string().trim().min(1, 'Référence requise.').max(100),
  name: z.string().trim().min(1, 'Désignation requise.').max(250),
  family: z.string().trim().min(1).max(120).default('À classer'),
  description: z.string().trim().max(2000).default(''),
  weightGrams: z.coerce.number().int().min(0).max(10_000_000).default(0),
  dimensionsMm: z.string().trim().max(160).default(''),
  cycleTimeSeconds: z.coerce.number().min(0).max(86_400).default(60),
  unitsPerPallet: z.coerce.number().int().min(1).max(1_000_000).default(100),
});

export const confirmCatalogImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  items: z.array(catalogDraftInputSchema).min(1).max(200),
});
