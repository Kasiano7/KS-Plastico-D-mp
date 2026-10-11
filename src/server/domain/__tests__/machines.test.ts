import { describe, expect, it } from 'vitest';
import {
  computeOee,
  intervalsOverlap,
  machineSeverity,
  optimizeMoldSequence,
  rankMachinesForJob,
} from '../machines';

describe('computeOee', () => {
  it('calcule le TRS comme le produit disponibilité × performance × qualité', () => {
    const oee = computeOee({
      plannedMinutes: 480,
      downtimeMinutes: 48,
      goodUnits: 400,
      rejectedUnits: 8,
      idealCycleTimeSeconds: 60,
    });

    expect(oee.availabilityPct).toBe(90);
    expect(oee.runMinutes).toBe(432);
    expect(oee.performancePct).toBeCloseTo(94.4, 1);
    expect(oee.qualityPct).toBeCloseTo(98, 1);
    expect(oee.oeePct).toBeCloseTo(83.3, 1);
  });

  it('renvoie zéro plutôt que NaN sur une machine sans production', () => {
    const oee = computeOee({
      plannedMinutes: 0,
      downtimeMinutes: 0,
      goodUnits: 0,
      rejectedUnits: 0,
      idealCycleTimeSeconds: 60,
    });

    expect(oee.oeePct).toBe(0);
  });
});

describe('intervalsOverlap', () => {
  it('détecte un chevauchement partiel', () => {
    expect(
      intervalsOverlap(
        new Date('2026-01-01T06:00:00Z'),
        new Date('2026-01-01T14:00:00Z'),
        new Date('2026-01-01T12:00:00Z'),
        new Date('2026-01-01T20:00:00Z'),
      ),
    ).toBe(true);
  });

  it('détecte un créneau entièrement contenu dans un autre', () => {
    expect(
      intervalsOverlap(
        new Date('2026-01-01T06:00:00Z'),
        new Date('2026-01-01T20:00:00Z'),
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T12:00:00Z'),
      ),
    ).toBe(true);
  });

  it('ne signale aucun chevauchement pour des créneaux consécutifs', () => {
    expect(
      intervalsOverlap(
        new Date('2026-01-01T06:00:00Z'),
        new Date('2026-01-01T14:00:00Z'),
        new Date('2026-01-01T14:00:00Z'),
        new Date('2026-01-01T20:00:00Z'),
      ),
    ).toBe(false);
  });

  it('ne signale aucun chevauchement pour des créneaux disjoints', () => {
    expect(
      intervalsOverlap(
        new Date('2026-01-01T06:00:00Z'),
        new Date('2026-01-01T10:00:00Z'),
        new Date('2026-01-01T14:00:00Z'),
        new Date('2026-01-01T20:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('rankMachinesForJob', () => {
  const candidates = [
    {
      machineId: 'p64',
      machineCode: 'Presse 64',
      unitsPerHour: 120,
      isPreferred: true,
      moldAlreadyMounted: true,
      freeHours: 0,
      isOperational: false, // en panne
      changeoverMinutes: 180,
    },
    {
      machineId: 'p65',
      machineCode: 'Presse 65',
      unitsPerHour: 100,
      isPreferred: false,
      moldAlreadyMounted: false,
      freeHours: 12,
      isOperational: true,
      changeoverMinutes: 180,
    },
    {
      machineId: 'p67',
      machineCode: 'Presse 67',
      unitsPerHour: 60,
      isPreferred: false,
      moldAlreadyMounted: false,
      freeHours: 4,
      isOperational: true,
      changeoverMinutes: 240,
    },
  ];

  it('écarte les machines à l’arrêt et retient celle qui tient le besoin', () => {
    const ranking = rankMachinesForJob(candidates, 800);

    expect(ranking[0].machineId).toBe('p65');
    expect(ranking[0].fits).toBe(true);
    // 8 h de production + 3 h de changement de moule
    expect(ranking[0].totalHoursNeeded).toBe(11);
    expect(ranking.find((m) => m.machineId === 'p64')!.fits).toBe(false);
  });

  it('ajoute le temps de changement de moule au besoin', () => {
    const ranking = rankMachinesForJob(candidates, 240);
    const p67 = ranking.find((m) => m.machineId === 'p67')!;

    expect(p67.totalHoursNeeded).toBe(8);
    expect(p67.fits).toBe(false); // 8 h nécessaires, 4 h libres
  });
});

describe('optimizeMoldSequence', () => {
  it('regroupe A → B → A en A → A → B et chiffre le gain', () => {
    const jobs = [
      { id: 'of-1', moldId: 'A', moldLabel: 'Moule A', quantityUnits: 500, unitsPerHour: 100, changeoverMinutes: 240 },
      { id: 'of-2', moldId: 'B', moldLabel: 'Moule B', quantityUnits: 500, unitsPerHour: 100, changeoverMinutes: 240 },
      { id: 'of-3', moldId: 'A', moldLabel: 'Moule A', quantityUnits: 500, unitsPerHour: 100, changeoverMinutes: 240 },
    ];

    const result = optimizeMoldSequence(jobs);

    expect(result.current.changeovers).toBe(2);
    expect(result.optimized.order).toEqual(['of-1', 'of-3', 'of-2']);
    expect(result.optimized.changeovers).toBe(1);
    expect(result.savedMinutes).toBe(240); // 4 heures
    expect(result.extraUnits).toBe(400);
    expect(result.improved).toBe(true);
  });

  it('ne propose rien quand la séquence est déjà optimale', () => {
    const jobs = [
      { id: 'of-1', moldId: 'A', moldLabel: 'A', quantityUnits: 100, unitsPerHour: 100, changeoverMinutes: 120 },
      { id: 'of-2', moldId: 'A', moldLabel: 'A', quantityUnits: 100, unitsPerHour: 100, changeoverMinutes: 120 },
    ];

    expect(optimizeMoldSequence(jobs).improved).toBe(false);
  });
});

describe('machineSeverity', () => {
  it('n’affiche le rouge que pour les états réellement critiques', () => {
    expect(machineSeverity('production')).toBe('normal');
    expect(machineSeverity('idle')).toBe('info');
    expect(machineSeverity('setup')).toBe('warning');
    expect(machineSeverity('mold_change')).toBe('warning');
    expect(machineSeverity('stopped')).toBe('critical');
    expect(machineSeverity('fault')).toBe('critical');
  });
});
