import 'server-only';

import { Readable } from 'node:stream';
import ExcelJS, { type CellValue, type Worksheet } from 'exceljs';
import type { CatalogImportDraft } from '@/lib/catalog-import';

type DraftWithoutDuplicate = Omit<CatalogImportDraft, 'duplicate'>;

const COLUMN_ALIASES = {
  reference: ['reference', 'ref', 'code', 'code article', 'sku', 'article'],
  name: ['designation', 'nom', 'name', 'libelle', 'produit', 'piece'],
  family: ['famille', 'family', 'categorie', 'category', 'type'],
  description: ['description', 'details', 'detail', 'commentaire', 'notes'],
  weightGrams: ['poids', 'poids g', 'poids kg', 'poids grammes', 'weight', 'weight g', 'weight kg', 'masse'],
  dimensionsMm: ['dimensions', 'dimension', 'dimensions mm', 'format', 'taille'],
  cycleTimeSeconds: ['cycle', 'temps cycle', 'temps de cycle', 'cycle secondes', 'cycle s'],
  unitsPerPallet: ['pieces palette', 'piece palette', 'unites palette', 'qte palette', 'conditionnement'],
} as const;

type CatalogColumn = keyof typeof COLUMN_ALIASES;

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value) return String(value.result ?? '');
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return String(value.text ?? '');
    return '';
  }
  return String(value).trim();
}

function worksheetRows(sheet: Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let index = 1; index <= row.cellCount; index += 1) {
      values.push(cellText(row.getCell(index).value));
    }
    if (values.some(Boolean)) rows.push(values);
  });
  return rows.slice(0, 1001);
}

function columnFor(header: string): CatalogColumn | null {
  const normalized = normalizeHeader(header);
  for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [CatalogColumn, readonly string[]][]) {
    if (aliases.includes(normalized)) return column;
  }
  return null;
}

function parseNumber(value: string): number | null {
  const cleaned = value
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWeight(value: string, header: string): number {
  const number = parseNumber(value) ?? 0;
  const normalized = normalizeHeader(`${header} ${value}`);
  return Math.max(0, Math.round(normalized.includes('kg') ? number * 1000 : number));
}

export type ParsedSpreadsheet = {
  drafts: DraftWithoutDuplicate[];
  rawRows: string[][];
  warnings: string[];
};

export async function parseSpreadsheet(
  buffer: Buffer,
  extension: 'xlsx' | 'csv',
): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();
  let sheet: Worksheet | undefined;

  if (extension === 'csv') {
    sheet = await workbook.csv.read(Readable.from(buffer), {
      parserOptions: { delimiter: buffer.includes(Buffer.from(';')) ? ';' : ',' },
    });
  } else {
    // ExcelJS embarque une ancienne déclaration de Buffer ; le contenu reste
    // le même Buffer Node validé par la route d'import.
    await workbook.xlsx.load(buffer as never);
    sheet = workbook.worksheets[0];
  }

  if (!sheet) throw new Error('Le fichier ne contient aucune feuille exploitable.');
  const rows = worksheetRows(sheet);
  if (rows.length === 0) throw new Error('Le fichier est vide.');

  let headerIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < Math.min(rows.length, 10); index += 1) {
    const score = rows[index].filter((value) => columnFor(value)).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  }

  const headers = rows[headerIndex];
  const mapping = new Map<CatalogColumn, number>();
  headers.forEach((header, index) => {
    const column = columnFor(header);
    if (column && !mapping.has(column)) mapping.set(column, index);
  });

  if (!mapping.has('reference')) {
    return {
      drafts: [],
      rawRows: rows.slice(0, 200),
      warnings: ["La colonne de référence n'a pas été reconnue automatiquement."],
    };
  }

  const get = (row: string[], column: CatalogColumn) => row[mapping.get(column) ?? -1] ?? '';
  const drafts = rows
    .slice(headerIndex + 1)
    .map((row, index): DraftWithoutDuplicate | null => {
      const reference = get(row, 'reference').trim().toUpperCase();
      if (!reference) return null;

      const rawName = get(row, 'name').trim();
      const rawFamily = get(row, 'family').trim();
      const issues: string[] = [];
      if (!rawName) issues.push('Désignation absente : référence utilisée comme nom.');
      if (!rawFamily) issues.push('Famille absente : valeur « À classer » proposée.');

      const cycle = parseNumber(get(row, 'cycleTimeSeconds'));
      const units = parseNumber(get(row, 'unitsPerPallet'));
      return {
        tempId: `row-${headerIndex + index + 2}`,
        reference,
        name: rawName || reference,
        family: rawFamily || 'À classer',
        description: get(row, 'description').trim(),
        weightGrams: parseWeight(
          get(row, 'weightGrams'),
          headers[mapping.get('weightGrams') ?? -1] ?? '',
        ),
        dimensionsMm: get(row, 'dimensionsMm').trim(),
        cycleTimeSeconds: cycle && cycle > 0 ? cycle : 60,
        unitsPerPallet: units && units > 0 ? Math.round(units) : 100,
        confidence: rawName ? 0.98 : 0.8,
        issues,
        sourceRow: headerIndex + index + 2,
      };
    })
    .filter((draft): draft is DraftWithoutDuplicate => draft !== null)
    .slice(0, 200);

  return {
    drafts,
    rawRows: rows.slice(0, 200),
    warnings:
      rows.length > 1001
        ? ['Seules les 1 000 premières lignes ont été analysées.']
        : [],
  };
}
