export type MoldPartRecord = {
  sheetNumber: string;
  designation: string;
  recycledMaterialPct?: number;
  partReferences?: string[];
  robotHandReference?: string;
  robotHandLocation?: string;
};

export type CompanyMold = {
  reference: string;
  weightKg?: number;
  location?: string;
  compatiblePresses: string[];
  parts: MoldPartRecord[];
};

/**
 * Relevé fictif de moules, construit pour la démonstration.
 * Les cases rouges du document signifient « injection interdite ».
 * Une valeur absente correspond à une information illisible ou non renseignée :
 * elle ne doit jamais être complétée par déduction dans l'interface.
 */
export const COMPANY_MOLDS: CompanyMold[] = [
  {
    reference: '700100',
    location: '144',
    compatiblePresses: ['60', '61', '63', '64', '66', '67'],
    parts: [
      { sheetNumber: '110', designation: '1/2 aile arrière Constructeur PL 5' },
      { sheetNumber: '161', designation: '1/2 aile arrière Constructeur PL 5 sans collier', partReferences: ['700100'], robotHandLocation: '31' },
    ],
  },
  {
    reference: '700110',
    weightKg: 8400,
    location: '143',
    compatiblePresses: ['60', '61', '63', '66', '67'],
    parts: [{ sheetNumber: '107', designation: '1/2 aile avant Constructeur PL 5', partReferences: ['700120'], robotHandReference: '700130', robotHandLocation: '26' }],
  },
  {
    reference: '700140',
    weightKg: 7500,
    location: '140',
    compatiblePresses: ['60', '61', '63', '66', '67'],
    parts: [{ sheetNumber: '108', designation: '1/2 aile avant droite avec SML Constructeur PL 5', partReferences: ['700150'], robotHandReference: '700130', robotHandLocation: '25' }],
  },
  {
    reference: '700160',
    weightKg: 7050,
    location: '139',
    compatiblePresses: ['60', '61', '63', '66', '67'],
    parts: [{ sheetNumber: '109', designation: '1/2 aile avant gauche avec SML Constructeur PL 5', partReferences: ['700170'], robotHandReference: '700130', robotHandLocation: '25' }],
  },
  {
    reference: '700180',
    weightKg: 6700,
    location: '90',
    compatiblePresses: ['60', '61', '63', '66', '67'],
    parts: [
      { sheetNumber: '19', designation: '1/2 aile XP 600 grise Constructeur PL 6', partReferences: ['700190'], robotHandReference: '700200', robotHandLocation: '82' },
      { sheetNumber: '1', designation: '1/2 aile XP 600 noire', recycledMaterialPct: 30, partReferences: ['700210'], robotHandReference: '700200', robotHandLocation: '82' },
    ],
  },
  {
    reference: '700220',
    weightKg: 1350,
    location: '79',
    compatiblePresses: ['59', '60', '61', '62', '63', '64', '65', '66', '67'],
    parts: [{ sheetNumber: '91', designation: 'Adapter battery box', recycledMaterialPct: 0, partReferences: ['700220'], robotHandReference: '700230' }],
  },
  {
    reference: '700240',
    weightKg: 1632,
    location: '3',
    compatiblePresses: ['59', '62', '64', '65', '66', '67'],
    parts: [{ sheetNumber: '178', designation: 'Adapter PL5 Constructeur remorques 1', recycledMaterialPct: 100, partReferences: ['700240'], robotHandReference: '700250', robotHandLocation: '119' }],
  },
  {
    reference: '700260',
    weightKg: 19400,
    location: '91',
    compatiblePresses: ['60', '63', '66', '67'],
    parts: [
      { sheetNumber: '53', designation: 'Aile distribution bord court gauche et droite grise', recycledMaterialPct: 0, partReferences: ['G 700270', 'D 700280'], robotHandReference: '700290', robotHandLocation: '89' },
      { sheetNumber: '54', designation: 'Aile distribution bord long gauche et droite grise', recycledMaterialPct: 0, partReferences: ['G 700300', 'D 700310'], robotHandReference: '700290', robotHandLocation: '89' },
    ],
  },
  {
    reference: '700300',
    location: '91',
    compatiblePresses: ['59', '60', '61', '62', '63', '64', '66', '67'],
    parts: [{ sheetNumber: '190', designation: 'Aile distribution export bord long gauche et droite', recycledMaterialPct: 0, partReferences: ['700320 G', '700330 D'], robotHandReference: '700290' }],
  },
  {
    reference: '700340',
    weightKg: 22000,
    location: '92',
    compatiblePresses: ['60', '63', '67'],
    parts: [
      { sheetNumber: '66', designation: 'Aile chantier 8 × 4 droite et gauche', recycledMaterialPct: 0, robotHandReference: '700350', robotHandLocation: '3' },
      { sheetNumber: '61', designation: 'Aile chantier bord court droite et gauche', recycledMaterialPct: 0, partReferences: ['D 700360', 'G 700340'], robotHandReference: '700350', robotHandLocation: '3' },
      { sheetNumber: '60', designation: 'Aile chantier bord long droite et gauche', recycledMaterialPct: 0, partReferences: ['D 700370', 'G 700380'], robotHandReference: '700350', robotHandLocation: '3' },
    ],
  },
  {
    reference: '700390',
    weightKg: 6360,
    compatiblePresses: ['59', '61', '63', '66', '67'],
    parts: [{ sheetNumber: '209', designation: 'Aile engin TP', recycledMaterialPct: 2, partReferences: ['700400'] }],
  },
  {
    reference: '700410',
    location: '71',
    compatiblePresses: ['59', '60', '62', '64', '66', '67'],
    parts: [{ sheetNumber: '171', designation: 'Aileron 4640 Constructeur remorques 1 avec et sans perçage', recycledMaterialPct: 100, robotHandReference: '700420', robotHandLocation: '27' }],
  },
  {
    reference: '700430',
    weightKg: 1810,
    location: '51',
    compatiblePresses: ['59', '61', '66', '67'],
    parts: [{ sheetNumber: '11', designation: 'Aileron 4640 noir', recycledMaterialPct: 100, robotHandReference: '700420', robotHandLocation: '43' }],
  },
  {
    reference: '700440',
    weightKg: 8400,
    location: '130',
    compatiblePresses: ['59', '66', '67'],
    parts: [{ sheetNumber: '181', designation: 'Aileron 4652 Constructeur remorques 1 avec et sans perçage', recycledMaterialPct: 100, robotHandReference: '700450', robotHandLocation: '105' }],
  },
  {
    reference: '700460',
    weightKg: 1900,
    location: '58',
    compatiblePresses: ['59', '60', '61', '62', '64', '65', '66', '67'],
    parts: [{ sheetNumber: '172', designation: 'Aileron 4600 Constructeur remorques 1 avec ou sans perçage', recycledMaterialPct: 100, robotHandReference: '700420', robotHandLocation: '73' }],
  },
  {
    reference: '700470',
    weightKg: 2150,
    location: '70',
    compatiblePresses: ['59', '61', '62', '66', '67'],
    parts: [{ sheetNumber: '16', designation: 'Aileron 4680 noir', recycledMaterialPct: 100, partReferences: ['700480'], robotHandReference: '700420', robotHandLocation: '27' }],
  },
  {
    reference: '700490',
    weightKg: 10300,
    location: '83',
    compatiblePresses: ['59', '61', '62', '66', '67'],
    parts: [{ sheetNumber: '82', designation: 'Aileron distribution', recycledMaterialPct: 0, partReferences: ['700490'], robotHandReference: '700500', robotHandLocation: '40' }],
  },
  {
    reference: '700510',
    weightKg: 16200,
    location: '83',
    compatiblePresses: ['59', '60', '61', '62', '63', '64', '65', '66', '67'],
    parts: [{ sheetNumber: '84', designation: 'Aileron H390', recycledMaterialPct: 0, robotHandLocation: '40' }],
  },
];

export const MOLD_SOURCE = {
  reference: 'Relevé de démonstration',
  date: '15/01/2026',
  page: '1/9',
} as const;

export const MOLD_PRESS_NUMBERS = ['59', '60', '61', '62', '63', '64', '65', '66', '67'] as const;
