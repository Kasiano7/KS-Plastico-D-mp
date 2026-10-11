/**
 * Rapport quotidien — composition du message.
 *
 * Un logiciel qu'on doit penser à ouvrir sort de la routine ; un logiciel qui
 * vient à vous y entre. Ce module compose le texte envoyé chaque matin, et il
 * est **pur** : aucune base, aucun réseau, donc entièrement testable.
 *
 * Deux règles de rédaction :
 *
 *   1. **L'objet porte l'information**, pas le nom du produit. « KS Plastico Demo —
 *      rapport » n'apprend rien dans une boîte de réception ; « 2 commandes
 *      menacées, Presse 64 arrêtée » se lit sans ouvrir.
 *   2. **Aucun écart inventé.** Sans chiffres de la veille, la comparaison est
 *      omise plutôt que remplacée par un zéro.
 */

export type DailyReportInput = {
  date: Date;
  healthScore: number;
  producedUnits: number;
  targetUnits: number;
  lateOrders: number;
  machinesDown: number;
  machinesTotal: number;
  downtimeMinutes: number;
  /** Alertes ouvertes, les plus graves d'abord. */
  criticalAlerts: { title: string; impactCents: number }[];
  previous: { producedUnits: number; lateOrders: number } | null;
};

export type DailyReportMessage = { subject: string; text: string };

export type ReportFormatters = {
  dateLong: (value: Date) => string;
  number: (value: number) => string;
  cents: (value: number) => string;
  duration: (minutes: number) => string;
};

/**
 * Objet du message : ce qui demande une décision, dans l'ordre de gravité.
 * S'il n'y a rien à signaler, l'objet le dit — c'est une information aussi.
 */
function buildSubject(input: DailyReportInput): string {
  const facts: string[] = [];

  if (input.machinesDown > 0) {
    facts.push(
      `${input.machinesDown} machine${input.machinesDown > 1 ? 's' : ''} à l’arrêt`,
    );
  }
  if (input.lateOrders > 0) {
    facts.push(`${input.lateOrders} commande${input.lateOrders > 1 ? 's' : ''} en retard`);
  }

  if (facts.length === 0) return `Usine — rien à signaler (santé ${input.healthScore}/100)`;
  return `Usine — ${facts.join(', ')} (santé ${input.healthScore}/100)`;
}

export function buildDailyReport(
  input: DailyReportInput,
  format: ReportFormatters,
): DailyReportMessage {
  const achievement =
    input.targetUnits > 0 ? Math.round((input.producedUnits / input.targetUnits) * 100) : 0;

  const lines: string[] = [
    `Rapport du ${format.dateLong(input.date)}`,
    '',
    `Santé de l’usine : ${input.healthScore}/100`,
    `Production : ${format.number(input.producedUnits)} sur ${format.number(input.targetUnits)} pièces (${achievement} %)`,
    `Machines : ${input.machinesTotal - input.machinesDown}/${input.machinesTotal} disponibles`,
    `Arrêts cumulés : ${format.duration(input.downtimeMinutes)}`,
    `Commandes en retard : ${input.lateOrders}`,
  ];

  if (input.previous) {
    const production = input.producedUnits - input.previous.producedUnits;
    const late = input.lateOrders - input.previous.lateOrders;
    lines.push(
      '',
      'Depuis le dernier relevé :',
      `  Production ${signed(production, format.number)}`,
      `  Commandes en retard ${signed(late, format.number)}`,
    );
  }

  if (input.criticalAlerts.length > 0) {
    lines.push('', 'À traiter en priorité :');
    for (const alert of input.criticalAlerts) {
      lines.push(
        alert.impactCents > 0
          ? `  · ${alert.title} — ${format.cents(alert.impactCents)}`
          : `  · ${alert.title}`,
      );
    }
  } else {
    lines.push('', 'Aucune alerte critique ouverte.');
  }

  lines.push(
    '',
    'Le détail complet est dans KS Plastico Demo, onglet Analyse › Rapport du jour.',
    '',
    'Ce message est généré automatiquement. Les chiffres proviennent des mesures',
    'et calculs de l’application ; aucun n’est estimé sans être signalé comme tel.',
  );

  return { subject: buildSubject(input), text: lines.join('\n') };
}

/** « +240 » / « −3 » / « stable » — le signe est explicite. */
function signed(value: number, format: (n: number) => string): string {
  if (value === 0) return 'stable';
  return value > 0 ? `+${format(value)}` : `−${format(Math.abs(value))}`;
}
