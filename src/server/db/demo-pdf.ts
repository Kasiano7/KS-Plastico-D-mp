/**
 * Générateur de PDF minimal pour le jeu de démonstration.
 *
 * Un document listé dans la bibliothèque doit pouvoir s'ouvrir : un faux
 * contenu binaire donnerait une ligne crédible à l'écran et un fichier
 * corrompu au téléchargement. Ces PDF sont réels, lisibles par n'importe quel
 * lecteur, et portent en clair la mention « document de démonstration ».
 *
 * Aucune dépendance : la structure PDF 1.4 tient en cinq objets.
 */

/** Le jeu de caractères PDF de base ignore nos accents — on les translittère. */
function toLatin(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[«»]/g, '"')
    .replace(/[—–]/g, '-');
}

/** `(`, `)` et `\` terminent ou échappent une chaîne PDF : il faut les protéger. */
function escapePdfText(value: string): string {
  return toLatin(value).replace(/([\\()])/g, '\\$1');
}

export type DemoPdfOptions = {
  title: string;
  subtitle?: string;
  lines?: string[];
};

/**
 * Construit un PDF d'une page et renvoie son contenu encodé en base64.
 *
 * Les décalages de la table `xref` sont calculés en octets sur le document
 * assemblé — c'est ce qui rend le fichier valide plutôt que seulement
 * plausible.
 */
export function buildDemoPdf({ title, subtitle, lines = [] }: DemoPdfOptions): {
  base64: string;
  sizeBytes: number;
} {
  const body: string[] = [
    'BT /F2 16 Tf 60 780 Td (' + escapePdfText(title) + ') Tj ET',
  ];

  if (subtitle) {
    body.push('BT /F1 11 Tf 60 758 Td (' + escapePdfText(subtitle) + ') Tj ET');
  }

  let y = 720;
  for (const line of lines) {
    body.push('BT /F1 11 Tf 60 ' + y + ' Td (' + escapePdfText(line) + ') Tj ET');
    y -= 18;
  }

  body.push(
    'BT /F1 9 Tf 60 60 Td (' +
      escapePdfText('KS Plastico Demo - document de demonstration, sans valeur contractuelle.') +
      ') Tj ET',
  );

  const stream = body.join('\n');
  const streamLength = Buffer.byteLength(stream, 'latin1');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + streamLength + ' >>\nstream\n' + stream + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const buffer = Buffer.from(pdf, 'latin1');
  return { base64: buffer.toString('base64'), sizeBytes: buffer.byteLength };
}
