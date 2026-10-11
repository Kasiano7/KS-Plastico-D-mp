import { describe, expect, it } from 'vitest';
import {
  checkQualification,
  computeShiftCoverage,
  findTransferCandidates,
  type EmployeeAvailability,
} from '../staffing';

const team: EmployeeAvailability[] = [
  {
    employeeId: 'e1',
    fullName: 'Paul Durand',
    workshopId: 'A',
    jobTitle: 'Régleur',
    shift: 'afternoon',
    skills: ['presse_1000t', 'reglage'],
    validQualifications: ['sst'],
    isAbsent: false,
    availableFrom: '14:00',
  },
  {
    employeeId: 'e2',
    fullName: 'Julie Petit',
    workshopId: 'A',
    jobTitle: 'Opératrice',
    shift: 'morning',
    skills: ['controle_visuel'],
    validQualifications: [],
    isAbsent: false,
    availableFrom: '06:00',
  },
  {
    employeeId: 'e3',
    fullName: 'Luc Bernard',
    workshopId: 'A',
    jobTitle: 'Régleur',
    shift: 'morning',
    skills: ['presse_1000t', 'reglage'],
    validQualifications: [],
    isAbsent: true,
    availableFrom: null,
  },
  {
    employeeId: 'e4',
    fullName: 'Samir Richard',
    workshopId: 'B',
    jobTitle: 'Régleur',
    shift: 'morning',
    skills: ['presse_1000t'],
    validQualifications: ['sst'],
    isAbsent: false,
    availableFrom: '06:00',
  },
];

describe('findTransferCandidates', () => {
  it('ne retient que les personnes qualifiées de l’atelier source', () => {
    const candidates = findTransferCandidates(team, {
      fromWorkshopId: 'A',
      toWorkshopId: 'B',
      requiredSkills: ['presse_1000t', 'reglage'],
      requiredQualifications: ['sst'],
      sourceHeadcount: 12,
      sourceMinimumHeadcount: 10,
    });

    expect(candidates[0].fullName).toBe('Paul Durand');
    expect(candidates[0].isSafe).toBe(true);
    expect(candidates[0].availableFrom).toBe('14:00');
    expect(candidates[0].sourceCapacityAfterPct).toBe(92);
  });

  it('exclut les absents et les employés d’un autre atelier', () => {
    const ids = findTransferCandidates(team, {
      fromWorkshopId: 'A',
      toWorkshopId: 'B',
      requiredSkills: [],
      sourceHeadcount: 12,
      sourceMinimumHeadcount: 10,
    }).map((candidate) => candidate.employeeId);

    expect(ids).toContain('e1');
    expect(ids).toContain('e2');
    expect(ids).not.toContain('e3'); // absent
    expect(ids).not.toContain('e4'); // atelier B
  });

  it('refuse le transfert s’il met l’atelier source sous son effectif minimum', () => {
    const candidates = findTransferCandidates(team, {
      fromWorkshopId: 'A',
      toWorkshopId: 'B',
      requiredSkills: ['presse_1000t', 'reglage'],
      sourceHeadcount: 10,
      sourceMinimumHeadcount: 10,
    });

    expect(candidates.every((candidate) => !candidate.isSafe)).toBe(true);
  });

  it('signale les compétences manquantes', () => {
    const candidates = findTransferCandidates(team, {
      fromWorkshopId: 'A',
      toWorkshopId: 'B',
      requiredSkills: ['presse_1000t'],
      sourceHeadcount: 12,
      sourceMinimumHeadcount: 10,
    });

    const sonia = candidates.find((candidate) => candidate.employeeId === 'e2')!;
    expect(sonia.missingSkills).toEqual(['presse_1000t']);
    expect(sonia.isSafe).toBe(false);
  });
});

describe('checkQualification', () => {
  const now = new Date('2026-08-11T08:00:00Z');

  it('détecte une habilitation expirée', () => {
    expect(checkQualification(new Date('2026-06-01T00:00:00Z'), now).status).toBe('expired');
  });

  it('alerte plusieurs mois avant l’expiration', () => {
    const check = checkQualification(new Date('2026-10-01T00:00:00Z'), now, 90);
    expect(check.status).toBe('expiring');
    expect(check.daysRemaining).toBe(50);
  });

  it('reste valide au-delà de la fenêtre d’alerte', () => {
    expect(checkQualification(new Date('2027-06-01T00:00:00Z'), now, 90).status).toBe('valid');
  });

  it('traite une habilitation sans échéance comme valide', () => {
    expect(checkQualification(null, now)).toEqual({ status: 'valid', daysRemaining: null });
  });
});

describe('computeShiftCoverage', () => {
  it('qualifie la couverture d’une équipe', () => {
    expect(computeShiftCoverage('morning', 10, 10).severity).toBe('normal');
    expect(computeShiftCoverage('afternoon', 10, 9).severity).toBe('info');
    expect(computeShiftCoverage('night', 10, 8).severity).toBe('warning');
    expect(computeShiftCoverage('night', 10, 5).severity).toBe('critical');
  });
});
