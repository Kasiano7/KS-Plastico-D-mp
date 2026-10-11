/**
 * Documentation technique — règles pures.
 *
 * La question que se pose un responsable maintenance devant une bibliothèque
 * documentaire n'est pas « combien de fichiers ? » mais « qu'est-ce qui me
 * manque le jour où la presse tombe ? ». Le calcul de couverture répond à
 * celle-là : il nomme les machines sans notice, sans plan, sans document du
 * tout — c'est-à-dire les dépannages qui se feront sans documentation.
 */

/** Catégories du référentiel, dans l'ordre d'affichage. */
export const DOCUMENT_CATEGORIES = [
  'notice_constructeur',
  'plan_electrique',
  'fiche_reglage',
  'rapport_intervention',
  'certificat_conformite',
  'autre',
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/**
 * Documents indispensables à un dépannage.
 *
 * Un rapport d'intervention ou une fiche de réglage sont utiles ; une notice
 * constructeur et un plan électrique sont ce sans quoi on ouvre une armoire
 * en aveugle. Seuls ces deux-là comptent comme une lacune.
 */
export const ESSENTIAL_CATEGORIES: readonly DocumentCategory[] = [
  'notice_constructeur',
  'plan_electrique',
];

export type DocumentRecord = {
  machineId: string;
  category: string;
  sizeBytes: number;
};

export type MachineRecord = {
  id: string;
  name: string;
  code: string;
  workshopName: string;
};

export type CategoryCount = {
  category: DocumentCategory;
  count: number;
  sizeBytes: number;
};

export type MachineCoverage = {
  machineId: string;
  name: string;
  code: string;
  workshopName: string;
  documentCount: number;
  /** Catégories essentielles absentes, dans l'ordre du référentiel. */
  missing: DocumentCategory[];
};

export type DocumentLibrarySummary = {
  documentCount: number;
  totalSizeBytes: number;
  categories: CategoryCount[];
  /** Machines classées : les moins bien documentées d'abord. */
  coverage: MachineCoverage[];
  /** Machines possédant les deux documents essentiels. */
  fullyCoveredCount: number;
  machineCount: number;
};

/**
 * Formats affichables directement dans le navigateur.
 *
 * La liste est **volontairement fermée**. Servir un fichier déposé par un
 * utilisateur « en ligne » sur notre propre domaine, c'est lui laisser exécuter
 * du script dans la session de celui qui le consulte : un `.html` ou un `.svg`
 * affiché ainsi vaut une faille XSS. Ni l'un ni l'autre ne figure ici, et tout
 * format inconnu retombe sur le téléchargement.
 */
export type DocumentPreviewKind = 'pdf' | 'image' | 'text';

const PREVIEWABLE: Record<string, DocumentPreviewKind> = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'text/plain': 'text',
};

/** `null` = format non affichable : le téléchargement reste le seul accès. */
export function documentPreviewKind(mimeType: string): DocumentPreviewKind | null {
  return PREVIEWABLE[mimeType.split(';')[0].trim().toLowerCase()] ?? null;
}

/**
 * En-tête `Content-Disposition` d'un affichage en ligne.
 *
 * Même échappement que la version téléchargement — seule la consigne change.
 */
export function inlineHeader(fileName: string): string {
  return attachmentHeader(fileName).replace(/^attachment;/, 'inline;');
}

/**
 * En-tête `Content-Disposition` d'un téléchargement.
 *
 * Un en-tête HTTP ne transporte que des octets latin-1 : un nom de fichier
 * contenant « é » ou un tiret cadratin fait échouer la réponse entière. La
 * RFC 6266 prévoit exactement ce cas — un `filename` ASCII pour les clients
 * anciens, un `filename*` encodé en UTF-8 pour tous les autres, qui l'utilisent
 * en priorité et retrouvent donc le nom d'origine.
 */
export function attachmentHeader(fileName: string): string {
  const ascii =
    fileName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Tout ce qui n'est pas un caractère ASCII imprimable devient « _ ».
      .replace(/[^\x20-\x7e]/g, '_')
      // Guillemets et antislashs termineraient ou échapperaient la valeur.
      .replace(/["\\]/g, '')
      .trim() || 'document';

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Toute catégorie inconnue est rattachée à « autre » plutôt que perdue. */
function normalizeCategory(value: string): DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as DocumentCategory)
    : 'autre';
}

export function summarizeDocumentLibrary(
  documents: DocumentRecord[],
  machines: MachineRecord[],
): DocumentLibrarySummary {
  const byCategory = new Map<DocumentCategory, CategoryCount>(
    DOCUMENT_CATEGORIES.map((category) => [category, { category, count: 0, sizeBytes: 0 }]),
  );
  const perMachine = new Map<string, { count: number; categories: Set<DocumentCategory> }>();

  let totalSizeBytes = 0;

  for (const document of documents) {
    const category = normalizeCategory(document.category);
    const bucket = byCategory.get(category);
    if (bucket) {
      bucket.count += 1;
      bucket.sizeBytes += document.sizeBytes;
    }
    totalSizeBytes += document.sizeBytes;

    const machine = perMachine.get(document.machineId) ?? { count: 0, categories: new Set() };
    machine.count += 1;
    machine.categories.add(category);
    perMachine.set(document.machineId, machine);
  }

  const coverage: MachineCoverage[] = machines.map((machine) => {
    const held = perMachine.get(machine.id);
    return {
      machineId: machine.id,
      name: machine.name,
      code: machine.code,
      workshopName: machine.workshopName,
      documentCount: held?.count ?? 0,
      missing: ESSENTIAL_CATEGORIES.filter((category) => !held?.categories.has(category)),
    };
  });

  /*
   * Le tri met devant ce qu'il faut corriger : d'abord le plus de manques,
   * puis le moins de documents, puis l'ordre alphabétique pour que deux
   * affichages successifs ne s'échangent jamais deux lignes.
   */
  coverage.sort(
    (a, b) =>
      b.missing.length - a.missing.length ||
      a.documentCount - b.documentCount ||
      a.name.localeCompare(b.name, 'fr'),
  );

  return {
    documentCount: documents.length,
    totalSizeBytes,
    categories: [...byCategory.values()],
    coverage,
    fullyCoveredCount: coverage.filter((machine) => machine.missing.length === 0).length,
    machineCount: machines.length,
  };
}
