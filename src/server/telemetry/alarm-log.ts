import 'server-only';

import type {
  MachineEventImpact,
  MachineEventRecord,
  MachineEventSeverity,
  MachineEventStatus,
  MachineEventType,
} from '../domain/machine-events';

/**
 * Journal d'alarmes automate — troisième abstraction de la passerelle (§31).
 *
 * Une presse tient son propre journal : plusieurs dizaines d'entrées par jour,
 * codées (« E-1024 »), horodatées à la seconde. Ce journal n'est pas la
 * mémoire métier de l'usine (table `incidents`) : c'est une trace machine
 * brute, que l'on lit et que l'on corrèle.
 *
 * En V1, aucune presse n'est connectée. L'implémentation ci-dessous **génère**
 * ce journal de façon déterministe à partir de l'identité de la machine et du
 * calendrier : deux lectures successives renvoient exactement le même journal,
 * et deux machines n'ont pas la même histoire. Chaque enregistrement porte
 * `source: 'simulated'`, et l'interface le signale.
 *
 * Brancher une vraie passerelle OPC UA / EUROMAP 77 consistera à fournir une
 * autre implémentation de cette interface — rien d'autre ne bougera.
 */
export interface MachineAlarmLogProvider {
  readonly id: string;
  readonly label: string;
  readonly measured: boolean;
  /** Journal d'une machine sur une fenêtre fermée. */
  read(input: {
    machineId: string;
    /** Graine stable, indépendante de l'UUID de base (code machine). */
    seed: string;
    from: Date;
    to: Date;
  }): Promise<MachineEventRecord[]>;
}

type AlarmTemplate = {
  code: string;
  type: MachineEventType;
  severity: MachineEventSeverity;
  title: string;
  description: string;
  impact: MachineEventImpact;
  /** Poids relatif d'apparition dans le journal. */
  weight: number;
  /** Durée typique en secondes, bornes incluses. */
  duration: [number, number];
  correctiveAction: string | null;
};

/**
 * Catalogue d'alarmes d'une presse à injecter.
 * Les codes suivent la convention usuelle : `E-` pour un défaut, `I-` pour une
 * information de conduite.
 */
const ALARM_CATALOG: AlarmTemplate[] = [
  {
    code: 'E-1024',
    type: 'alarm',
    severity: 'critical',
    title: 'Défaut robot prélèv. pièce',
    description: 'Échec de la prise de pièce au robot',
    impact: 'machine_stop',
    weight: 12,
    duration: [95, 320],
    correctiveAction: 'Réalignement du préhenseur et reprise du cycle en automatique.',
  },
  {
    code: 'E-1060',
    type: 'alarm',
    severity: 'critical',
    title: 'Sécurité porte ouverte',
    description: 'Porte de protection ouverte en cycle',
    impact: 'machine_stop',
    weight: 6,
    duration: [45, 180],
    correctiveAction: 'Fermeture de la porte et réarmement de la sécurité.',
  },
  {
    code: 'E-2011',
    type: 'incident',
    severity: 'major',
    title: 'Pression d’injection instable',
    description: 'Variation de la pression hors tolérance',
    impact: 'slowdown',
    weight: 9,
    duration: [120, 420],
    correctiveAction: 'Contrôle du clapet anti-retour, purge et reprise progressive.',
  },
  {
    code: 'E-3007',
    type: 'incident',
    severity: 'major',
    title: 'Température huile hydraulique élevée',
    description: 'Température supérieure à la limite (55 °C)',
    impact: 'slowdown',
    weight: 7,
    duration: [180, 600],
    correctiveAction: 'Nettoyage de l’échangeur et contrôle du circuit de refroidissement.',
  },
  {
    code: 'E-2032',
    type: 'incident',
    severity: 'major',
    title: 'Vitesse vis hors plage',
    description: 'Vitesse de rotation anormale détectée',
    impact: 'slowdown',
    weight: 5,
    duration: [90, 360],
    correctiveAction: 'Réglage du profil de dosage.',
  },
  {
    code: 'E-3014',
    type: 'incident',
    severity: 'major',
    title: 'Niveau matière bas',
    description: 'Ajout de matière nécessaire',
    impact: 'slowdown',
    weight: 6,
    duration: [60, 240],
    correctiveAction: 'Réapprovisionnement de la trémie.',
  },
  {
    code: 'I-1003',
    type: 'information',
    severity: 'minor',
    title: 'Démarrage machine',
    description: 'Démarrage en automatique',
    impact: 'none',
    weight: 7,
    duration: [0, 0],
    correctiveAction: null,
  },
  {
    code: 'I-2001',
    type: 'information',
    severity: 'minor',
    title: 'Changement de production',
    description: 'Nouvelle référence chargée sur la presse',
    impact: 'none',
    weight: 6,
    duration: [0, 0],
    correctiveAction: null,
  },
  {
    code: 'I-2002',
    type: 'information',
    severity: 'minor',
    title: 'Fin de production',
    description: 'Production arrêtée manuellement',
    impact: 'none',
    weight: 5,
    duration: [0, 0],
    correctiveAction: null,
  },
  {
    code: 'I-3005',
    type: 'information',
    severity: 'minor',
    title: 'Lubrification automatique',
    description: 'Cycle de lubrification effectué',
    impact: 'none',
    weight: 9,
    duration: [0, 0],
    correctiveAction: null,
  },
  {
    code: 'I-4001',
    type: 'information',
    severity: 'info',
    title: 'Sauvegarde des paramètres',
    description: 'Jeu de paramètres enregistré sur le pupitre',
    impact: 'none',
    weight: 5,
    duration: [0, 0],
    correctiveAction: null,
  },
  {
    code: 'I-4002',
    type: 'information',
    severity: 'info',
    title: 'Connexion opérateur',
    description: 'Ouverture de session sur le pupitre',
    impact: 'none',
    weight: 4,
    duration: [0, 0],
    correctiveAction: null,
  },
];

/**
 * Alarmes secondaires déclenchées par un défaut robot. Elles décrivent la même
 * panne : l'écran les regroupe au lieu de compter trois pannes.
 */
const ROBOT_CASCADE: { code: string; title: string; description: string; severity: MachineEventSeverity }[] = [
  {
    code: 'E-1031',
    title: 'Erreur préhenseur',
    description: 'Ventouse en défaut de vide',
    severity: 'major',
  },
  {
    code: 'E-1060',
    title: 'Sécurité porte ouverte',
    description: 'Ouverture porte pour dégagement de la pièce',
    severity: 'major',
  },
  {
    code: 'E-1099',
    title: 'Cycle interrompu',
    description: 'Cycle automate interrompu par le défaut amont',
    severity: 'minor',
  },
];

const TOTAL_WEIGHT = ALARM_CATALOG.reduce((sum, template) => sum + template.weight, 0);

/** Suite pseudo-aléatoire reproductible : même graine ⇒ même journal. */
function makeRandom(seed: string) {
  let state = 2_166_136_261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16_777_619);

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function pickTemplate(value: number): AlarmTemplate {
  let cursor = value * TOTAL_WEIGHT;
  for (const template of ALARM_CATALOG) {
    cursor -= template.weight;
    if (cursor <= 0) return template;
  }
  return ALARM_CATALOG[ALARM_CATALOG.length - 1];
}

/** Équipe couvrant une heure donnée — 3×8 classique. */
export function shiftLabelAt(date: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' })
      .format(date)
      .replace(/\D/g, ''),
  );
  if (hour >= 6 && hour < 14) return 'Équipe A (Matin)';
  if (hour >= 14 && hour < 22) return 'Équipe B (Soir)';
  return 'Nuit';
}

function between(random: () => number, [min, max]: [number, number]): number {
  return Math.round(min + random() * (max - min));
}

export class SimulatedAlarmLogProvider implements MachineAlarmLogProvider {
  readonly id = 'simulated-alarm-log';
  readonly label = 'Journal automate simulé (aucune presse connectée)';
  readonly measured = false;

  /** Nombre moyen d'entrées par jour et par presse. */
  private readonly entriesPerDay = 31;

  async read(input: {
    machineId: string;
    seed: string;
    from: Date;
    to: Date;
  }): Promise<MachineEventRecord[]> {
    const { machineId, seed, from, to } = input;
    const spanMs = Math.max(to.getTime() - from.getTime(), 60_000);
    const days = Math.max(Math.round(spanMs / 86_400_000), 1);
    const count = days * this.entriesPerDay;

    const random = makeRandom(`${seed}:alarm-log`);
    const events: MachineEventRecord[] = [];

    for (let index = 0; index < count; index += 1) {
      // Répartition sur toute la fenêtre, avec une dispersion intra-créneau :
      // les événements ne tombent pas à intervalle régulier.
      const slotStart = from.getTime() + (index / count) * spanMs;
      const occurredAt = new Date(slotStart + random() * (spanMs / count));
      if (occurredAt > to) continue;

      const template = pickTemplate(random());
      const durationSeconds = template.duration[1] > 0 ? between(random, template.duration) : null;
      const id = `${machineId}:log:${index}`;

      events.push(
        buildRecord({
          id,
          machineId,
          template,
          occurredAt,
          durationSeconds,
          random,
          parentEventId: null,
        }),
      );

      // Un défaut robot ne remonte jamais seul : il entraîne trois alarmes
      // secondaires dans la minute. Elles sont rattachées au défaut d'origine.
      if (template.code === 'E-1024') {
        ROBOT_CASCADE.forEach((cascade, rank) => {
          const childAt = new Date(occurredAt.getTime() + (rank + 1) * 4_000 + random() * 3_000);
          if (childAt > to) return;

          events.push(
            buildRecord({
              id: `${id}:${cascade.code}`,
              machineId,
              template: {
                ...template,
                code: cascade.code,
                title: cascade.title,
                description: cascade.description,
                severity: cascade.severity,
                type: 'alarm',
                impact: 'machine_stop',
                correctiveAction: null,
              },
              occurredAt: childAt,
              durationSeconds: Math.max((durationSeconds ?? 60) - (rank + 1) * 12, 10),
              random,
              parentEventId: id,
            }),
          );
        });
      }
    }

    return events;
  }
}

function buildRecord(input: {
  id: string;
  machineId: string;
  template: AlarmTemplate;
  occurredAt: Date;
  durationSeconds: number | null;
  random: () => number;
  parentEventId: string | null;
}): MachineEventRecord {
  const { id, machineId, template, occurredAt, durationSeconds, random, parentEventId } = input;

  const status: MachineEventStatus =
    template.impact === 'none' || random() > 0.12 ? 'resolved' : random() > 0.5 ? 'acknowledged' : 'open';

  const productionImpact =
    template.impact === 'none' || durationSeconds === null
      ? null
      : {
          downtimeSeconds: template.impact === 'machine_stop' ? durationSeconds : 0,
          lostParts: Math.round((durationSeconds / 60) * (template.impact === 'machine_stop' ? 5.5 : 1.8)),
          rejectedParts: template.impact === 'slowdown' ? Math.round(random() * 6) : 0,
        };

  return {
    id,
    machineId,
    occurredAt,
    type: template.type,
    severity: template.severity,
    code: template.code,
    title: template.title,
    description: template.description,
    durationSeconds,
    endedAt: durationSeconds ? new Date(occurredAt.getTime() + durationSeconds * 1_000) : null,
    impact: template.impact,
    operator: null,
    shift: shiftLabelAt(occurredAt),
    status,
    productReference: null,
    readings: [
      { label: 'Pression injection', value: `${820 + Math.round(random() * 60)} bar` },
      { label: 'Température buse', value: `${236 + Math.round(random() * 10)} °C` },
      { label: 'Température moule', value: `${(30 + random() * 4).toFixed(1).replace('.', ',')} °C` },
      { label: 'Temps de cycle', value: `${(20 + random() * 4).toFixed(1).replace('.', ',')} s` },
    ],
    correctiveAction: status === 'resolved' ? template.correctiveAction : null,
    maintenanceComment: null,
    productionImpact,
    parentEventId,
    source: 'simulated',
  };
}

let provider: MachineAlarmLogProvider | null = null;

/** Point d'accès unique — seul endroit à changer le jour de la passerelle. */
export function getAlarmLogProvider(): MachineAlarmLogProvider {
  provider ??= new SimulatedAlarmLogProvider();
  return provider;
}
