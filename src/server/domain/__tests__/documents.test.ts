import { describe, expect, it } from 'vitest';
import {
  attachmentHeader,
  documentPreviewKind,
  inlineHeader,
  summarizeDocumentLibrary,
} from '../documents';

const MACHINES = [
  { id: 'm1', name: 'Presse 01', code: 'P-01', workshopName: 'Atelier A' },
  { id: 'm2', name: 'Presse 02', code: 'P-02', workshopName: 'Atelier A' },
  { id: 'm3', name: 'Presse 03', code: 'P-03', workshopName: 'Atelier B' },
];

describe('summarizeDocumentLibrary', () => {
  it('compte les documents et les octets par catégorie', () => {
    const summary = summarizeDocumentLibrary(
      [
        { machineId: 'm1', category: 'notice_constructeur', sizeBytes: 1000 },
        { machineId: 'm1', category: 'notice_constructeur', sizeBytes: 500 },
        { machineId: 'm2', category: 'plan_electrique', sizeBytes: 200 },
      ],
      MACHINES,
    );

    expect(summary.documentCount).toBe(3);
    expect(summary.totalSizeBytes).toBe(1700);

    const notice = summary.categories.find((row) => row.category === 'notice_constructeur');
    expect(notice).toEqual({ category: 'notice_constructeur', count: 2, sizeBytes: 1500 });
  });

  it('expose les six catégories même vides, dans l’ordre du référentiel', () => {
    const summary = summarizeDocumentLibrary([], MACHINES);

    expect(summary.categories.map((row) => row.category)).toEqual([
      'notice_constructeur',
      'plan_electrique',
      'fiche_reglage',
      'rapport_intervention',
      'certificat_conformite',
      'autre',
    ]);
    expect(summary.categories.every((row) => row.count === 0)).toBe(true);
  });

  it('rattache une catégorie inconnue à « autre » plutôt que de la perdre', () => {
    const summary = summarizeDocumentLibrary(
      [{ machineId: 'm1', category: 'categorie_supprimee', sizeBytes: 42 }],
      MACHINES,
    );

    expect(summary.documentCount).toBe(1);
    expect(summary.categories.find((row) => row.category === 'autre')).toEqual({
      category: 'autre',
      count: 1,
      sizeBytes: 42,
    });
  });

  it('signale les documents essentiels manquants machine par machine', () => {
    const summary = summarizeDocumentLibrary(
      [
        { machineId: 'm1', category: 'notice_constructeur', sizeBytes: 10 },
        { machineId: 'm1', category: 'plan_electrique', sizeBytes: 10 },
        { machineId: 'm2', category: 'notice_constructeur', sizeBytes: 10 },
      ],
      MACHINES,
    );

    const byId = Object.fromEntries(summary.coverage.map((row) => [row.machineId, row]));
    expect(byId.m1.missing).toEqual([]);
    expect(byId.m2.missing).toEqual(['plan_electrique']);
    expect(byId.m3.missing).toEqual(['notice_constructeur', 'plan_electrique']);
    expect(summary.fullyCoveredCount).toBe(1);
    expect(summary.machineCount).toBe(3);
  });

  it('classe les machines les moins bien documentées en premier', () => {
    const summary = summarizeDocumentLibrary(
      [
        { machineId: 'm1', category: 'notice_constructeur', sizeBytes: 10 },
        { machineId: 'm1', category: 'plan_electrique', sizeBytes: 10 },
        { machineId: 'm2', category: 'notice_constructeur', sizeBytes: 10 },
      ],
      MACHINES,
    );

    // m3 n'a rien, m2 a une lacune, m1 est complète.
    expect(summary.coverage.map((row) => row.machineId)).toEqual(['m3', 'm2', 'm1']);
  });

  it('départage deux machines identiques par ordre alphabétique, jamais au hasard', () => {
    const summary = summarizeDocumentLibrary([], [
      { id: 'b', name: 'Presse Z', code: 'P-Z', workshopName: 'A' },
      { id: 'a', name: 'Presse A', code: 'P-A', workshopName: 'A' },
    ]);

    expect(summary.coverage.map((row) => row.name)).toEqual(['Presse A', 'Presse Z']);
  });

  it('ignore un document rattaché à une machine absente du parc', () => {
    const summary = summarizeDocumentLibrary(
      [{ machineId: 'inconnue', category: 'notice_constructeur', sizeBytes: 99 }],
      MACHINES,
    );

    // Le document reste compté, mais il n'invente aucune ligne de couverture.
    expect(summary.documentCount).toBe(1);
    expect(summary.coverage).toHaveLength(3);
    expect(summary.coverage.every((row) => row.documentCount === 0)).toBe(true);
  });

  it('ne renvoie aucune couverture quand le parc est vide', () => {
    const summary = summarizeDocumentLibrary([], []);

    expect(summary.coverage).toEqual([]);
    expect(summary.machineCount).toBe(0);
    expect(summary.fullyCoveredCount).toBe(0);
  });
});

describe('attachmentHeader', () => {
  it('conserve le nom exact dans filename*, que le client moderne utilise', () => {
    const header = attachmentHeader('Plan électrique — Presse 64.pdf');

    expect(header).toContain(
      "filename*=UTF-8''" + encodeURIComponent('Plan électrique — Presse 64.pdf'),
    );
  });

  it('ne laisse aucun caractère non-ASCII dans le filename de repli', () => {
    const header = attachmentHeader('Contrôle réglementaire — août.pdf');
    const fallback = /filename="([^"]*)"/.exec(header)![1];

    // Un seul octet hors latin-1 suffirait à faire échouer la réponse entière.
    expect(fallback).toBe('Controle reglementaire _ aout.pdf');
    expect(/^[ -~]*$/.test(fallback)).toBe(true);
  });

  it('retire guillemets et antislashs, qui casseraient la valeur', () => {
    const header = attachmentHeader('re"port\\v2.pdf');
    const fallback = /filename="([^"]*)"/.exec(header)![1];

    expect(fallback).toBe('reportv2.pdf');
    // Le nom d'origine, lui, reste intact dans la forme encodée.
    expect(header).toContain("filename*=UTF-8''" + encodeURIComponent('re"port\\v2.pdf'));
  });

  it('neutralise un retour à la ligne, qui injecterait un en-tête', () => {
    const fallback = /filename="([^"]*)"/.exec(attachmentHeader('a\r\nSet-Cookie: x=1.pdf'))![1];

    expect(fallback).toBe('a__Set-Cookie: x=1.pdf');
  });

  it('retombe sur « document » quand il ne reste rien d’ASCII', () => {
    const fallback = /filename="([^"]*)"/.exec(attachmentHeader('   '))![1];

    expect(fallback).toBe('document');
  });
});

describe('documentPreviewKind', () => {
  it('reconnaît les formats que le navigateur sait afficher', () => {
    expect(documentPreviewKind('application/pdf')).toBe('pdf');
    expect(documentPreviewKind('image/png')).toBe('image');
    expect(documentPreviewKind('image/jpeg')).toBe('image');
    expect(documentPreviewKind('text/plain')).toBe('text');
  });

  it('refuse HTML et SVG, qui exécuteraient du script dans notre session', () => {
    expect(documentPreviewKind('text/html')).toBeNull();
    expect(documentPreviewKind('image/svg+xml')).toBeNull();
  });

  it('refuse les formats bureautiques, que le navigateur ne rend pas', () => {
    expect(documentPreviewKind('application/msword')).toBeNull();
    expect(
      documentPreviewKind(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ),
    ).toBeNull();
    expect(documentPreviewKind('application/octet-stream')).toBeNull();
  });

  it('tolère un paramètre de jeu de caractères et la casse', () => {
    expect(documentPreviewKind('TEXT/PLAIN; charset=utf-8')).toBe('text');
  });
});

describe('inlineHeader', () => {
  it('affiche en ligne tout en gardant l’échappement du nom', () => {
    const header = inlineHeader('Plan électrique — Presse 64.pdf');

    expect(header.startsWith('inline; filename="Plan electrique _ Presse 64.pdf"')).toBe(true);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).not.toContain('attachment');
  });
});
