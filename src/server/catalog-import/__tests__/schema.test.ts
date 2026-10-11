import { describe, expect, it } from 'vitest';
import { confirmCatalogImportSchema } from '../schema';

const validItem = {
  reference: 'TEST-001',
  name: 'Pièce de test',
  family: 'Test',
  description: '',
  weightGrams: 1250,
  dimensionsMm: '120 × 80 × 20',
  cycleTimeSeconds: 45,
  unitsPerPallet: 250,
};

describe('validation de l’import catalogue', () => {
  it('accepte une proposition complète validée par un humain', () => {
    const parsed = confirmCatalogImportSchema.safeParse({
      fileName: 'references.xlsx',
      items: [validItem],
    });

    expect(parsed.success).toBe(true);
  });

  it('refuse une référence vide', () => {
    const parsed = confirmCatalogImportSchema.safeParse({
      fileName: 'references.xlsx',
      items: [{ ...validItem, reference: '   ' }],
    });

    expect(parsed.success).toBe(false);
  });

  it('refuse un lot dépassant la limite de sécurité', () => {
    const parsed = confirmCatalogImportSchema.safeParse({
      fileName: 'references.xlsx',
      items: Array.from({ length: 201 }, (_, index) => ({
        ...validItem,
        reference: `TEST-${index}`,
      })),
    });

    expect(parsed.success).toBe(false);
  });
});
