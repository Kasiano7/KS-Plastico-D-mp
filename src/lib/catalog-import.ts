export type CatalogImportDraft = {
  tempId: string;
  reference: string;
  name: string;
  family: string;
  description: string;
  weightGrams: number;
  dimensionsMm: string;
  cycleTimeSeconds: number;
  unitsPerPallet: number;
  confidence: number;
  issues: string[];
  duplicate: boolean;
  sourceRow: number | null;
};

export type CatalogImportAnalysis = {
  fileName: string;
  provider: 'local' | 'openai';
  drafts: CatalogImportDraft[];
  warnings: string[];
};

export type CatalogImportConfirmation = {
  created: number;
  skipped: number;
  references: string[];
};
