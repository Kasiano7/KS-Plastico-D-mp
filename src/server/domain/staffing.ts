/**
 * Disponibilité et mobilité du personnel (§21, §22).
 */

import { clamp, percent, round } from './math';

export type OperatorProductionRow = {
  /** Identifiant technique du salarié — jamais son nom, jamais son matricule. */
  employeeId: string;
  workshopId: string | null;
  workshopName: string | null;
  shift: 'morning' | 'afternoon' | 'night';
  machineCode: string;
  goodUnits: number;
  rejectedUnits: number;
  downtimeMinutes: number;
};

export type OperatorProductionSummary = {
  employeeId: string;
  workshopId: string | null;
  workshopName: string | null;
  shift: 'morning' | 'afternoon' | 'night';
  machineCodes: string[];
  goodUnits: number;
  rejectedUnits: number;
  downtimeMinutes: number;
  scrapRatePct: number;
};

/**
 * Agrège les sessions de production du jour par salarié, à partir du seul
 * identifiant technique (§ couche de confidentialité IA — `ai-privacy.ts`).
 * Ce calcul reste entièrement local : un écart de production entre deux
 * personnes se lit ici, il n'est jamais recalculé par un fournisseur IA.
 */
export function aggregateOperatorProduction(
  rows: readonly OperatorProductionRow[],
): OperatorProductionSummary[] {
  const byEmployee = new Map<string, OperatorProductionSummary>();

  for (const row of rows) {
    const existing = byEmployee.get(row.employeeId);
    if (existing) {
      existing.goodUnits += row.goodUnits;
      existing.rejectedUnits += row.rejectedUnits;
      existing.downtimeMinutes += row.downtimeMinutes;
      if (!existing.machineCodes.includes(row.machineCode)) existing.machineCodes.push(row.machineCode);
      continue;
    }
    byEmployee.set(row.employeeId, {
      employeeId: row.employeeId,
      workshopId: row.workshopId,
      workshopName: row.workshopName,
      shift: row.shift,
      machineCodes: [row.machineCode],
      goodUnits: row.goodUnits,
      rejectedUnits: row.rejectedUnits,
      downtimeMinutes: row.downtimeMinutes,
      scrapRatePct: 0,
    });
  }

  return [...byEmployee.values()].map((summary) => ({
    ...summary,
    scrapRatePct: percent(summary.rejectedUnits, summary.goodUnits + summary.rejectedUnits, 1),
  }));
}

export type EmployeeAvailability = {
  employeeId: string;
  fullName: string;
  workshopId: string | null;
  jobTitle: string;
  shift: 'morning' | 'afternoon' | 'night';
  /** Compétences détenues, par code. */
  skills: readonly string[];
  /** Habilitations valides à la date considérée. */
  validQualifications: readonly string[];
  isAbsent: boolean;
  /** Heure à partir de laquelle la personne est mobilisable (format `HH:MM`). */
  availableFrom: string | null;
};

export type TransferRequest = {
  fromWorkshopId: string;
  toWorkshopId: string;
  /** Compétences exigées sur le poste cible. */
  requiredSkills: readonly string[];
  requiredQualifications?: readonly string[];
  /** Effectif actuellement présent dans l'atelier source. */
  sourceHeadcount: number;
  /** Effectif minimum pour que l'atelier source tienne son objectif. */
  sourceMinimumHeadcount: number;
};

export type TransferCandidate = {
  employeeId: string;
  fullName: string;
  availableFrom: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  /** Capacité restante de l'atelier source après ce transfert, en %. */
  sourceCapacityAfterPct: number;
  isSafe: boolean;
};

/**
 * Répond à « qui puis-je déplacer de A vers B sans mettre A en difficulté ? ».
 * Ne propose que des personnes réellement qualifiées, et chiffre toujours
 * l'effet sur l'atelier d'origine.
 */
export function findTransferCandidates(
  employees: readonly EmployeeAvailability[],
  request: TransferRequest,
): TransferCandidate[] {
  const pool = employees.filter(
    (employee) => employee.workshopId === request.fromWorkshopId && !employee.isAbsent,
  );

  return pool
    .map((employee) => {
      const matchedSkills = request.requiredSkills.filter((skill) => employee.skills.includes(skill));
      const missingSkills = request.requiredSkills.filter((skill) => !employee.skills.includes(skill));
      const hasQualifications = (request.requiredQualifications ?? []).every((qualification) =>
        employee.validQualifications.includes(qualification),
      );

      const headcountAfter = request.sourceHeadcount - 1;
      const sourceCapacityAfterPct = percent(headcountAfter, Math.max(request.sourceHeadcount, 1));
      const isSafe =
        missingSkills.length === 0 &&
        hasQualifications &&
        headcountAfter >= request.sourceMinimumHeadcount;

      return {
        employeeId: employee.employeeId,
        fullName: employee.fullName,
        availableFrom: employee.availableFrom,
        matchedSkills,
        missingSkills,
        sourceCapacityAfterPct,
        isSafe,
      };
    })
    .sort((a, b) => Number(b.isSafe) - Number(a.isSafe) || a.missingSkills.length - b.missingSkills.length);
}

export type QualificationStatus = 'valid' | 'expiring' | 'expired';

export type QualificationCheck = {
  status: QualificationStatus;
  daysRemaining: number | null;
};

/** Statut d'une habilitation à une date donnée (§21). */
export function checkQualification(
  expiresAt: Date | null,
  now: Date,
  alertLeadDays = 90,
): QualificationCheck {
  if (!expiresAt) return { status: 'valid', daysRemaining: null };

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / msPerDay);

  if (daysRemaining < 0) return { status: 'expired', daysRemaining };
  if (daysRemaining <= alertLeadDays) return { status: 'expiring', daysRemaining };
  return { status: 'valid', daysRemaining };
}

export type ShiftCoverage = {
  shift: 'morning' | 'afternoon' | 'night';
  required: number;
  present: number;
  coveragePct: number;
  severity: 'normal' | 'info' | 'warning' | 'critical';
};

export function computeShiftCoverage(
  shift: ShiftCoverage['shift'],
  required: number,
  present: number,
): ShiftCoverage {
  const coveragePct = required > 0 ? round(clamp((present / required) * 100, 0, 200)) : 100;
  const severity: ShiftCoverage['severity'] =
    coveragePct >= 100 ? 'normal' : coveragePct >= 90 ? 'info' : coveragePct >= 75 ? 'warning' : 'critical';
  return { shift, required, present, coveragePct, severity };
}
