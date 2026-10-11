/**
 * Signaux process d'une presse à injecter (§44).
 *
 * Ce module est **pur** : il ne lit ni base ni machine. Il transforme un état
 * machine réel (statut, cycle, tonnage, moule monté) en un jeu de grandeurs
 * process cohérentes entre elles — pression d'injection, températures de
 * fourreau, consommations.
 *
 * Ces grandeurs ne sont pas mesurées : aucune presse n'est connectée en V1.
 * Elles sont donc **estimées** de façon déterministe (même machine + même
 * tranche de temps ⇒ même valeur), afin que :
 *   - le rendu serveur et un éventuel rafraîchissement restent cohérents,
 *   - deux écrans ne racontent jamais deux histoires différentes,
 *   - l'origine « estimée » puisse être affichée honnêtement à l'utilisateur.
 *
 * Le jour où une passerelle OPC UA / EUROMAP 77 alimentera la table
 * `machine_telemetry`, seul le fournisseur appellera encore ces fonctions en
 * secours : la forme des données ne bougera pas.
 */

import { clamp, round } from './math';

export type SignalTone = 'normal' | 'info' | 'warning' | 'critical';

/** Une grandeur process affichable sous forme de barre horizontale. */
export type ProcessSignal = {
  key: string;
  label: string;
  /** Valeur formatée, unité comprise (« 842 bar »). */
  display: string;
  /** Remplissage de la barre, 0 → 100. */
  fillPct: number;
  tone: SignalTone;
};

export type TemperatureZone = {
  key: string;
  label: string;
  celsius: number;
  /** Échelle de la barre, propre à la zone. */
  maxCelsius: number;
  tone: SignalTone;
};

export type ConsumptionReading = {
  electricityKwh: number;
  electricityAverageKw: number;
  waterCubicMeters: number;
  waterAverageCubicMetersPerHour: number;
  compressedAirNormalCubicMeters: number;
  compressedAirAverageNormalCubicMetersPerHour: number;
};

export type MachineSignals = {
  running: boolean;
  injectionPressureBar: number;
  holdingPressureBar: number;
  nozzleTemperatureC: number;
  moldTemperatureC: number;
  screwSpeedRpm: number;
  hydraulicKw: number;
  totalKw: number;
  oilLevelOk: boolean;
  materialLevelPct: number;
  zones: TemperatureZone[];
  consumption: ConsumptionReading;
};

export type MachineSignalsInput = {
  /** Identifiant stable de la machine — sert de graine. */
  seed: string;
  /** La presse injecte-t-elle réellement ? */
  running: boolean;
  /** Tonnage de fermeture ; pilote l'ordre de grandeur des pressions. */
  tonnage: number;
  /** Temps de cycle observé, en secondes. */
  cycleTimeSeconds: number | null;
  /** Heures d'ouverture retenues pour les cumuls de consommation. */
  windowHours: number;
  /** Tranche de temps courante — fige les valeurs sur sa durée. */
  bucket: number;
};

/**
 * Bruit reproductible dans [0 ; 1[, fonction de la graine, d'un canal et de la
 * tranche de temps. Deux canaux différents ne sont jamais corrélés.
 */
function noise(seed: string, channel: string, bucket: number): number {
  let hash = 2_166_136_261 ^ bucket;
  for (const char of `${seed}:${channel}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16_777_619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

/** Valeur centrée sur `center`, à ± `spread`, stable pour une tranche donnée. */
function around(seed: string, channel: string, bucket: number, center: number, spread: number) {
  return center + (noise(seed, channel, bucket) * 2 - 1) * spread;
}

/** Tranche de 5 minutes : assez vivant pour un atelier, assez stable pour être lu. */
export function signalBucket(at: Date, minutes = 5): number {
  return Math.floor(at.getTime() / (minutes * 60_000));
}

/**
 * Dérive un jeu complet de signaux process.
 * Presse à l'arrêt ⇒ pressions et débits nuls, températures qui retombent :
 * une machine arrêtée ne doit jamais afficher une consommation de production.
 */
export function deriveMachineSignals(input: MachineSignalsInput): MachineSignals {
  const { seed, running, bucket } = input;
  const tonnage = input.tonnage > 0 ? input.tonnage : 800;
  const cycle = input.cycleTimeSeconds && input.cycleTimeSeconds > 0 ? input.cycleTimeSeconds : 60;

  // Ordres de grandeur usuels en injection technique : la pression suit le
  // tonnage, le maintien vaut environ 60 % de l'injection.
  const injectionPressureBar = running ? Math.round(around(seed, 'inj', bucket, 620 + tonnage * 0.18, 45)) : 0;
  const holdingPressureBar = running ? Math.round(injectionPressureBar * 0.61) : 0;
  const nozzleTemperatureC = Math.round(around(seed, 'nozzle', bucket, running ? 238 : 92, running ? 6 : 14));
  const moldTemperatureC = round(around(seed, 'mold', bucket, running ? 31.5 : 24, running ? 2.4 : 3), 1);
  // Un cycle court demande une vis plus rapide : le signal reste cohérent avec
  // le temps de cycle réellement observé sur la presse.
  const screwSpeedRpm = running
    ? Math.round(clamp(around(seed, 'screw', bucket, 88 * (60 / cycle), 8), 25, 180))
    : 0;

  const hydraulicKw = running ? round(around(seed, 'hydraulic', bucket, 4.2 + tonnage * 0.011, 1.4), 1) : 0;
  const totalKw = running ? round(hydraulicKw + around(seed, 'total', bucket, 3.1, 0.8), 1) : 0;
  const materialLevelPct = Math.round(clamp(around(seed, 'material', bucket, running ? 62 : 78, 22), 4, 98));
  const oilLevelOk = noise(seed, 'oil', bucket) > 0.08;

  const zones: TemperatureZone[] = [
    { key: 'nozzle', label: 'Buse', celsius: nozzleTemperatureC, maxCelsius: 280 },
    { key: 'zone-1', label: 'Zone 1', celsius: Math.round(nozzleTemperatureC - 28), maxCelsius: 280 },
    { key: 'zone-2', label: 'Zone 2', celsius: Math.round(nozzleTemperatureC - 34), maxCelsius: 280 },
    { key: 'zone-3', label: 'Zone 3', celsius: Math.round(nozzleTemperatureC - 39), maxCelsius: 280 },
    { key: 'zone-4', label: 'Zone 4', celsius: Math.round(nozzleTemperatureC - 44), maxCelsius: 280 },
    { key: 'mold-return', label: 'Moule (retour)', celsius: Math.round(moldTemperatureC), maxCelsius: 120 },
  ].map((zone) => ({ ...zone, tone: temperatureTone(zone.key, zone.celsius, running) }));

  const hours = Math.max(input.windowHours, 0.5);
  const electricityAverageKw = running ? round(totalKw * 0.87, 1) : round(totalKw * 0.2 + 1.2, 1);
  const waterAverage = running ? round(around(seed, 'water', bucket, 0.13, 0.03), 2) : 0.01;
  const airAverage = running ? round(around(seed, 'air', bucket, 1.19, 0.22), 2) : 0.04;

  return {
    running,
    injectionPressureBar,
    holdingPressureBar,
    nozzleTemperatureC,
    moldTemperatureC,
    screwSpeedRpm,
    hydraulicKw,
    totalKw,
    oilLevelOk,
    materialLevelPct,
    zones,
    consumption: {
      electricityKwh: round(electricityAverageKw * hours, 1),
      electricityAverageKw,
      waterCubicMeters: round(waterAverage * hours, 1),
      waterAverageCubicMetersPerHour: waterAverage,
      compressedAirNormalCubicMeters: round(airAverage * hours, 1),
      compressedAirAverageNormalCubicMetersPerHour: airAverage,
    },
  };
}

function temperatureTone(key: string, celsius: number, running: boolean): SignalTone {
  if (!running) return 'info';
  if (key === 'mold-return') return celsius > 60 ? 'warning' : 'info';
  if (celsius > 265) return 'critical';
  if (celsius > 250) return 'warning';
  return 'normal';
}

/** Traduit les signaux en lignes affichables — l'UI ne calcule rien. */
export function toProcessSignalList(signals: MachineSignals): ProcessSignal[] {
  const bar = (value: number, max: number) => clamp((value / max) * 100, 0, 100);

  return [
    {
      key: 'injection-pressure',
      label: 'Pression injection',
      display: `${signals.injectionPressureBar} bar`,
      fillPct: bar(signals.injectionPressureBar, 1_200),
      tone: signals.injectionPressureBar > 1_050 ? 'warning' : 'normal',
    },
    {
      key: 'nozzle-temperature',
      label: 'Température buse',
      display: `${signals.nozzleTemperatureC} °C`,
      fillPct: bar(signals.nozzleTemperatureC, 300),
      tone: signals.nozzleTemperatureC > 265 ? 'warning' : 'normal',
    },
    {
      key: 'mold-temperature',
      label: 'Température moule',
      display: `${signals.moldTemperatureC.toFixed(1).replace('.', ',')} °C`,
      fillPct: bar(signals.moldTemperatureC, 90),
      tone: signals.moldTemperatureC > 60 ? 'warning' : 'normal',
    },
    {
      key: 'holding-pressure',
      label: 'Pression maintien',
      display: `${signals.holdingPressureBar} bar`,
      fillPct: bar(signals.holdingPressureBar, 900),
      tone: 'normal',
    },
    {
      key: 'screw-speed',
      label: 'Vitesse vis',
      display: `${signals.screwSpeedRpm} rpm`,
      fillPct: bar(signals.screwSpeedRpm, 180),
      tone: 'normal',
    },
    {
      key: 'hydraulic-power',
      label: 'Conso. hydraulique',
      display: `${signals.hydraulicKw.toFixed(1).replace('.', ',')} kW`,
      fillPct: bar(signals.hydraulicKw, 60),
      tone: 'normal',
    },
    {
      key: 'total-power',
      label: 'Conso. totale',
      display: `${signals.totalKw.toFixed(1).replace('.', ',')} kW`,
      fillPct: bar(signals.totalKw, 60),
      tone: 'normal',
    },
    {
      key: 'oil-level',
      label: 'Niveau d’huile',
      display: signals.oilLevelOk ? 'Bon' : 'Bas',
      fillPct: signals.oilLevelOk ? 22 : 8,
      tone: signals.oilLevelOk ? 'normal' : 'critical',
    },
    {
      key: 'material-level',
      label: 'Niveau matière',
      display: `${signals.materialLevelPct} %`,
      fillPct: signals.materialLevelPct,
      tone: signals.materialLevelPct < 15 ? 'warning' : 'normal',
    },
  ];
}

/* ─────────────────────────────────────────────── Répartition du temps ──── */

export type AvailabilitySplit = {
  productiveMinutes: number;
  plannedStopMinutes: number;
  unplannedStopMinutes: number;
  totalMinutes: number;
  productivePct: number;
  plannedStopPct: number;
  unplannedStopPct: number;
};

/** Statuts considérés comme des arrêts planifiés (réglage, moule, maintenance). */
const PLANNED_STOP_STATUSES = new Set(['setup', 'mold_change', 'maintenance']);

/**
 * Répartit une journée machine entre production, arrêts planifiés et arrêts
 * subis. Les minutes viennent des événements réels : rien n'est estimé ici.
 */
export function splitAvailability(
  entries: readonly { status: string; durationMinutes: number }[],
  windowMinutes: number,
): AvailabilitySplit {
  let productive = 0;
  let planned = 0;
  let unplanned = 0;

  for (const entry of entries) {
    if (entry.status === 'production') productive += entry.durationMinutes;
    else if (PLANNED_STOP_STATUSES.has(entry.status)) planned += entry.durationMinutes;
    else unplanned += entry.durationMinutes;
  }

  const known = productive + planned + unplanned;
  // Le temps non couvert par un événement est du temps non planifié : on le
  // rattache aux arrêts subis plutôt que de faire disparaître des minutes.
  const total = Math.max(windowMinutes, known);
  unplanned += Math.max(total - known, 0);

  const share = (value: number) => (total > 0 ? round((value / total) * 100, 1) : 0);

  return {
    productiveMinutes: productive,
    plannedStopMinutes: planned,
    unplannedStopMinutes: unplanned,
    totalMinutes: total,
    productivePct: share(productive),
    plannedStopPct: share(planned),
    unplannedStopPct: share(unplanned),
  };
}

/* ──────────────────────────────────────────────── Séries temporelles ──── */

export type HourlyProductionPoint = {
  /** Libellé court pour l'axe X (« 08h »). */
  label: string;
  /** Libellé contextuel pour l'infobulle (« Hier 23h » / « Auj. 08h »). */
  fullLabel: string;
  hour: number;
  goodUnits: number;
  rejectedUnits: number;
  /** Objectif horaire : total des commandes de la pièce / heures actives. */
  targetUnits: number;
  /** Capacité horaire théorique maximale de la machine (pièces/h). */
  maxHourlyCapacity: number;
};

/**
 * Répartit la production sur 24 tranches horaires glissantes, au prorata du
 * temps réellement passé en production dans chaque tranche.
 *
 * La fenêtre couvre les 24 h précédant l'heure courante (windowStartMs) — pas
 * la journée civile. Le total de la série est toujours égal au total réel :
 * aucune pièce n'est créée ni perdue.
 */
export function buildHourlyProduction(input: {
  productiveMinutesByHour: readonly number[];
  goodUnits: number;
  rejectedUnits: number;
  targetUnits: number;
  maxHourlyCapacity: number;
  /** Timestamp UTC (ms) du début du premier slot, arrondi à l'heure. */
  windowStartMs: number;
  /** Timestamp UTC (ms) de minuit du jour courant, pour qualifier hier/auj. */
  todayStartMs: number;
}): HourlyProductionPoint[] {
  const minutes = input.productiveMinutesByHour.slice(0, 24);
  const totalMinutes = minutes.reduce((sum, value) => sum + value, 0);
  const activeHours = minutes.filter((value) => value > 0).length;

  let allocatedGood = 0;
  let allocatedRejected = 0;

  return Array.from({ length: 24 }, (_, index) => {
    const share = totalMinutes > 0 ? (minutes[index] ?? 0) / totalMinutes : 0;
    const isLast = index === 23;

    // La dernière tranche absorbe l'arrondi : la somme reste exacte.
    const good = isLast
      ? Math.max(input.goodUnits - allocatedGood, 0)
      : Math.round(input.goodUnits * share);
    const rejected = isLast
      ? Math.max(input.rejectedUnits - allocatedRejected, 0)
      : Math.round(input.rejectedUnits * share);

    allocatedGood += good;
    allocatedRejected += rejected;

    const slotMs = input.windowStartMs + index * 3_600_000;
    const slotHour = new Date(slotMs).getHours();
    const isToday = slotMs >= input.todayStartMs;
    const hourStr = `${String(slotHour).padStart(2, '0')}h`;

    return {
      label: hourStr,
      fullLabel: `${isToday ? 'Auj.' : 'Hier'} ${hourStr}`,
      hour: slotHour,
      goodUnits: good,
      rejectedUnits: rejected,
      targetUnits: activeHours > 0 ? Math.round(input.targetUnits / activeHours) : 0,
      maxHourlyCapacity: input.maxHourlyCapacity,
    };
  });
}

/** Part productive de chaque tranche horaire, en pourcentage (courbe 24 h). */
export function productiveShareSeries(productiveMinutesByHour: readonly number[]): number[] {
  return Array.from({ length: 24 }, (_, hour) =>
    Math.round(clamp(((productiveMinutesByHour[hour] ?? 0) / 60) * 100, 0, 100)),
  );
}
