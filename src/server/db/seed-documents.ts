import { sql } from 'drizzle-orm';
import type { Database } from './client';
import * as t from './schema';
import { buildDemoPdf } from './demo-pdf';
import { addDays } from './seed-helpers';

/**
 * Documentation technique de démonstration.
 *
 * Séparée du seed principal parce qu'elle doit pouvoir s'appliquer à une base
 * déjà chargée : la documentation est arrivée après le reste de l'application,
 * et l'histoire d'usine ne doit pas exiger une remise à zéro pour être
 * complète.
 *
 * L'histoire racontée ici : les presses récentes sont documentées, les quatre
 * du constructeur C de 2015-2016 — dont la Presse 64, à l'arrêt — n'ont jamais eu leur
 * plan électrique numérisé. C'est exactement la lacune que le panneau de
 * couverture doit faire remonter.
 */

/** Presses laissées sans plan électrique — le parc du constructeur C le plus ancien. */
const WITHOUT_ELECTRICAL_PLAN = new Set(['PR-61', 'PR-62', 'PR-63', 'PR-64']);

/** Presses laissées sans aucune documentation. */
const WITHOUT_ANY_DOCUMENT = new Set(['PR-54', 'PR-51']);

type DocumentSpec = {
  category: 'notice_constructeur' | 'plan_electrique' | 'fiche_reglage' | 'certificat_conformite';
  fileName: string;
  title: string;
  lines: string[];
  uploadedByLabel: string;
  daysAgo: number;
};

export async function seedMachineDocumentsIfEmpty(db: Database): Promise<number> {
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.machineDocuments);
  if ((existing?.count ?? 0) > 0) return 0;

  const machines = await db
    .select({
      id: t.machines.id,
      code: t.machines.code,
      name: t.machines.name,
      manufacturer: t.machines.manufacturer,
      model: t.machines.model,
      serialNumber: t.machines.serialNumber,
      manufacturingYear: t.machines.manufacturingYear,
      controlSoftware: t.machines.controlSoftware,
      controlSoftwareVersion: t.machines.controlSoftwareVersion,
    })
    .from(t.machines);

  if (machines.length === 0) return 0;

  const now = new Date();
  const rows: (typeof t.machineDocuments.$inferInsert)[] = [];

  for (const machine of machines) {
    if (WITHOUT_ANY_DOCUMENT.has(machine.code)) continue;

    const maker = machine.manufacturer ?? 'Constructeur';
    const model = machine.model ?? machine.code;
    const specs: DocumentSpec[] = [
      {
        category: 'notice_constructeur',
        fileName: `Notice ${maker} ${model} — ${machine.name}.pdf`,
        title: `Notice constructeur — ${maker} ${model}`,
        lines: [
          `Machine : ${machine.name} (${machine.code})`,
          `Numero de serie : ${machine.serialNumber ?? 'non renseigne'}`,
          `Annee de fabrication : ${machine.manufacturingYear ?? 'non renseignee'}`,
          `Commande : ${machine.controlSoftware ?? '-'} ${machine.controlSoftwareVersion ?? ''}`.trim(),
          '',
          'Sommaire : securite, mise en service, reglages, entretien periodique,',
          'diagnostic des defauts, pieces de rechange.',
        ],
        uploadedByLabel: 'Hervé Morel',
        daysAgo: 420,
      },
      {
        category: 'fiche_reglage',
        fileName: `Fiche de réglage — ${machine.name}.pdf`,
        title: `Fiche de reglage — ${machine.name}`,
        lines: [
          'Profil de temperatures fourreau, contre-pression, vitesse d injection,',
          'temps de maintien et de refroidissement par famille de moules.',
          '',
          'Toute modification est tracee et validee par le chef d atelier.',
        ],
        uploadedByLabel: 'Inès Garnier',
        daysAgo: 95,
      },
    ];

    if (!WITHOUT_ELECTRICAL_PLAN.has(machine.code)) {
      specs.push({
        category: 'plan_electrique',
        fileName: `Plan électrique ${model} — ${machine.name}.pdf`,
        title: `Plan electrique — ${machine.name}`,
        lines: [
          'Armoire de puissance, circuits de commande, securites et arrets d urgence.',
          `Schema constructeur ${maker}, revision applicable a la machine ${machine.code}.`,
        ],
        uploadedByLabel: 'Hervé Morel',
        daysAgo: 380,
      });
    }

    // Le certificat de conformité n'existe que pour les machines récentes.
    if ((machine.manufacturingYear ?? 0) >= 2019) {
      specs.push({
        category: 'certificat_conformite',
        fileName: `Certificat de conformité CE — ${machine.name}.pdf`,
        title: `Certificat de conformite CE — ${machine.name}`,
        lines: [
          `Declaration de conformite machine ${maker} ${model}.`,
          'Directive Machines 2006/42/CE. Controle periodique realise.',
        ],
        uploadedByLabel: 'Anne Laurent',
        daysAgo: 210,
      });
    }

    for (const spec of specs) {
      const pdf = buildDemoPdf({
        title: spec.title,
        subtitle: `Usine de démonstration — ${machine.name}`,
        lines: spec.lines,
      });

      rows.push({
        machineId: machine.id,
        category: spec.category,
        fileName: spec.fileName,
        mimeType: 'application/pdf',
        sizeBytes: pdf.sizeBytes,
        contentBase64: pdf.base64,
        uploadedByLabel: spec.uploadedByLabel,
        uploadedAt: addDays(now, -spec.daysAgo),
      });
    }
  }

  await db.insert(t.machineDocuments).values(rows);
  return rows.length;
}
