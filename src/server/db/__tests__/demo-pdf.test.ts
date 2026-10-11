import { describe, expect, it } from 'vitest';
import { buildDemoPdf } from '../demo-pdf';

function decode(base64: string): string {
  return Buffer.from(base64, 'base64').toString('latin1');
}

describe('buildDemoPdf', () => {
  it('produit un PDF réellement ouvrable — en-tête, xref et fin de fichier', () => {
    const { base64, sizeBytes } = buildDemoPdf({ title: 'Notice constructeur' });
    const pdf = decode(base64);

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(sizeBytes).toBe(Buffer.byteLength(pdf, 'latin1'));
  });

  it('inscrit dans la xref le décalage exact de chaque objet', () => {
    const pdf = decode(buildDemoPdf({ title: 'Plan électrique' }).base64);
    const xrefStart = pdf.indexOf('xref\n');
    const entries = pdf
      .slice(xrefStart)
      .split('\n')
      .filter((line) => / 00000 n $/.test(line))
      .map((line) => Number.parseInt(line.slice(0, 10), 10));

    expect(entries).toHaveLength(6);
    entries.forEach((offset, index) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${index + 1} 0 obj`));
    });
  });

  it('pointe startxref sur le début de la table', () => {
    const pdf = decode(buildDemoPdf({ title: 'Fiche de réglage' }).base64);
    const declared = Number.parseInt(pdf.slice(pdf.lastIndexOf('startxref') + 9).trim(), 10);

    expect(pdf.slice(declared)).toMatch(/^xref\n/);
  });

  it('translittère les accents, que la police de base ne sait pas rendre', () => {
    const pdf = decode(buildDemoPdf({ title: 'Contrôle réglementaire — août' }).base64);

    expect(pdf).toContain('(Controle reglementaire - aout)');
  });

  it('échappe les parenthèses, qui termineraient la chaîne PDF', () => {
    const pdf = decode(buildDemoPdf({ title: 'Presse 64 (type C) \\ rev. 2' }).base64);

    expect(pdf).toContain('(Presse 64 \\(type C\\) \\\\ rev. 2)');
  });

  it('déclare une longueur de flux égale au flux réellement écrit', () => {
    const pdf = decode(
      buildDemoPdf({ title: 'Notice', subtitle: 'Presse 21', lines: ['Ligne A', 'Ligne B'] }).base64,
    );
    const declared = Number.parseInt(/\/Length (\d+)/.exec(pdf)![1], 10);
    const stream = pdf.slice(pdf.indexOf('stream\n') + 7, pdf.indexOf('\nendstream'));

    expect(Buffer.byteLength(stream, 'latin1')).toBe(declared);
  });
});
