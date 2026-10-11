/**
 * TRS / OEE, compatibilité et capacité machine (§19, §28, §29).
 */

import { clamp, percent, round, safeDivide } from './math';

export type OeeInput = {
  /** Temps d'ouverture planifié, en minutes. */
  plannedMinutes: number;
  /** Arrêts subis, en minutes. */
  downtimeMinutes: number;
  goodUnits: number;
  rejectedUnits: number;
  /** Temps de cycle idéal par pièce, en secondes. */
  idealCycleTimeSeconds: number;
};

export type OeeResult = {
  availabilityPct: number;
  performancePct: number;
  qualityPct: number;
  oeePct: number;
  runMinutes: number;
};

/** TRS = Disponibilité × Performance × Qualité. */
export function computeOee(input: OeeInput): OeeResult {
  const runMinutes = Math.max(input.plannedMinutes - input.downtimeMinutes, 0);
  const totalUnits = input.goodUnits + input.rejectedUnits;

  const availability = clamp(safeDivide(runMinutes, input.plannedMinutes, 0), 0, 1);
  const theoreticalMinutes = (totalUnits * input.idealCycleTimeSeconds) / 60;
  const performance = clamp(safeDivide(theoreticalMinutes, runMinutes, 0), 0, 1);
  const quality = clamp(safeDivide(input.goodUnits, totalUnits, 0), 0, 1);

  return {
    availabilityPct: round(availability * 100, 1),
    performancePct: round(performance * 100, 1),
    qualityPct: round(quality * 100, 1),
    oeePct: round(availability * performance * quality * 100, 1),
    runMinutes,
  };
}

/**
 * Deux créneaux se chevauchent si l'un commence avant que l'autre ne se
 * termine, dans les deux sens (§19). Sert à interdire de charger deux ordres
 * sur la même presse au même moment.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type MachineCandidate = {
  machineId: string;
  machineCode: string;
  /** Cadence de la pièce sur cette machine, en pièces/heure. */
  unitsPerHour: number;
  isPreferred: boolean;
  /** Le moule requis est-il déjà monté ? */
  moldAlreadyMounted: boolean;
  /** Heures libres sur la fenêtre considérée. */
  freeHours: number;
  /** La machine est-elle opérationnelle ? */
  isOperational: boolean;
  changeoverMinutes: number;
};

export type MachineRanking = MachineCandidate & {
  /** Heures totales nécessaires, changement de moule inclus. */
  totalHoursNeeded: number;
  fits: boolean;
  score: number;
};

/**
 * Classe les machines capables de produire une quantité donnée.
 * Critères, par ordre d'importance : faisabilité, absence de changement de
 * moule, cadence, préférence process.
 */
export function rankMachinesForJob(
  candidates: readonly MachineCandidate[],
  quantityUnits: number,
): MachineRanking[] {
  return candidates
    .map((candidate) => {
      const productionHours = safeDivide(quantityUnits, candidate.unitsPerHour, Infinity);
      const changeoverHours = candidate.moldAlreadyMounted ? 0 : candidate.changeoverMinutes / 60;
      const totalHoursNeeded = round(productionHours + changeoverHours, 2);
      const fits = candidate.isOperational && totalHoursNeeded <= candidate.freeHours;

      // Les critères éliminatoires (machine opérationnelle, besoin qui tient
      // dans la fenêtre) dominent volontairement les critères d'optimisation.
      let score = 0;
      if (candidate.isOperational) score += 1_000;
      if (fits) score += 500;
      if (candidate.moldAlreadyMounted) score += 60;
      if (candidate.isPreferred) score += 20;
      score += clamp(candidate.unitsPerHour / 10, 0, 20);
      score -= clamp(changeoverHours * 2, 0, 20);

      return { ...candidate, totalHoursNeeded, fits, score: round(score, 2) };
    })
    .sort((a, b) => b.score - a.score);
}

export type ScheduledJob = {
  id: string;
  moldId: string;
  moldLabel: string;
  quantityUnits: number;
  unitsPerHour: number;
  changeoverMinutes: number;
};

export type MoldSequenceResult = {
  order: string[];
  changeovers: number;
  changeoverMinutes: number;
};

export type MoldOptimization = {
  current: MoldSequenceResult;
  optimized: MoldSequenceResult;
  savedMinutes: number;
  /** Pièces produisibles avec le temps regagné, à la cadence moyenne. */
  extraUnits: number;
  improved: boolean;
};

function sequenceCost(jobs: readonly ScheduledJob[]): MoldSequenceResult {
  let changeovers = 0;
  let minutes = 0;
  let previousMold: string | null = null;

  for (const job of jobs) {
    if (previousMold !== null && previousMold !== job.moldId) {
      changeovers += 1;
      minutes += job.changeoverMinutes;
    }
    previousMold = job.moldId;
  }

  return { order: jobs.map((job) => job.id), changeovers, changeoverMinutes: minutes };
}

/**
 * Optimisation des changements de moule (§20).
 * Regroupe les ordres partageant le même moule en conservant l'ordre d'arrivée
 * du premier ordre de chaque groupe — l'urgence relative reste donc respectée.
 */
export function optimizeMoldSequence(jobs: readonly ScheduledJob[]): MoldOptimization {
  const current = sequenceCost(jobs);

  const groups = new Map<string, ScheduledJob[]>();
  for (const job of jobs) {
    const group = groups.get(job.moldId);
    if (group) group.push(job);
    else groups.set(job.moldId, [job]);
  }

  const optimizedJobs = [...groups.values()].flat();
  const optimized = sequenceCost(optimizedJobs);

  const savedMinutes = Math.max(current.changeoverMinutes - optimized.changeoverMinutes, 0);
  const averageRate =
    jobs.length > 0 ? jobs.reduce((total, job) => total + job.unitsPerHour, 0) / jobs.length : 0;

  return {
    current,
    optimized,
    savedMinutes,
    extraUnits: Math.round((savedMinutes / 60) * averageRate),
    improved: savedMinutes > 0,
  };
}

/** Traduit un état machine en sévérité d'affichage. */
export function machineSeverity(
  status: string,
): 'normal' | 'info' | 'warning' | 'critical' {
  switch (status) {
    case 'production':
      return 'normal';
    case 'idle':
      return 'info';
    case 'setup':
    case 'mold_change':
    case 'maintenance':
      return 'warning';
    case 'stopped':
    case 'fault':
      return 'critical';
    default:
      return 'info';
  }
}

/**
 * Qualification métier du TRS — seuils uniques pour toute l'application.
 * Avant ce partage, le parc (fiches et cartes) et la fiche machine
 * utilisaient chacun leurs propres bornes : une même presse pouvait changer
 * de couleur selon l'écran (§29).
 */
export function oeeVerdict(oeePct: number): {
  label: string;
  severity: 'normal' | 'info' | 'warning' | 'critical';
} {
  if (oeePct >= 80) return { label: 'Bon', severity: 'normal' };
  if (oeePct >= 65) return { label: 'Correct', severity: 'info' };
  if (oeePct >= 50) return { label: 'Dégradé', severity: 'warning' };
  return { label: 'Critique', severity: 'critical' };
}

/**
 * Statuts pour lesquels une presse ne peut pas être retirée du parc actif :
 * le retrait n'est jamais une correction d'état déguisée, il faut d'abord
 * l'arrêter réellement. Partagé entre le contrôle d'UX côté client et la
 * revérification côté serveur (`setMachineActiveAction`) pour ne pas driver
 * silencieusement.
 */
export const RETIRE_BLOCKED_STATUSES = new Set(['production', 'setup', 'mold_change']);

export const MACHINE_STATUS_LABELS: Record<string, string> = {
  production: 'En production',
  setup: 'Réglage',
  mold_change: 'Changement de moule',
  stopped: 'Arrêt',
  fault: 'Défaut',
  maintenance: 'Maintenance',
  idle: 'Disponible',
};

/** Taux de réalisation d'un objectif de production. */
export function achievementPct(produced: number, target: number): number {
  return percent(produced, target);
}
