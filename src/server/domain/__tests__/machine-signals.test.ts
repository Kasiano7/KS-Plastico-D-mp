import { describe, expect, it } from 'vitest';
import {
  buildHourlyProduction,
  deriveMachineSignals,
  productiveShareSeries,
  splitAvailability,
  toProcessSignalList,
  type MachineSignalsInput,
} from '../machine-signals';

const base: MachineSignalsInput = {
  seed: 'PR-67',
  running: true,
  tonnage: 1_500,
  cycleTimeSeconds: 60,
  windowHours: 24,
  bucket: 5_800_000,
};

describe('deriveMachineSignals', () => {
  it('est déterministe : même machine, même tranche, mêmes valeurs', () => {
    expect(deriveMachineSignals(base)).toEqual(deriveMachineSignals(base));
  });

  it('donne des valeurs différentes à deux machines différentes', () => {
    const other = deriveMachineSignals({ ...base, seed: 'PR-04' });
    expect(other.injectionPressureBar).not.toBe(deriveMachineSignals(base).injectionPressureBar);
  });

  it('met tout à zéro sur une presse arrêtée', () => {
    const stopped = deriveMachineSignals({ ...base, running: false });

    expect(stopped.injectionPressureBar).toBe(0);
    expect(stopped.holdingPressureBar).toBe(0);
    expect(stopped.screwSpeedRpm).toBe(0);
    expect(stopped.totalKw).toBe(0);
    expect(stopped.nozzleTemperatureC).toBeLessThan(150);
  });

  it('reste dans des ordres de grandeur d’injection technique', () => {
    const signals = deriveMachineSignals(base);

    expect(signals.injectionPressureBar).toBeGreaterThan(600);
    expect(signals.injectionPressureBar).toBeLessThan(1_200);
    expect(signals.holdingPressureBar).toBeLessThan(signals.injectionPressureBar);
    expect(signals.nozzleTemperatureC).toBeGreaterThan(200);
    expect(signals.zones).toHaveLength(6);
    expect(signals.zones[0].celsius).toBeGreaterThan(signals.zones[4].celsius);
  });

  it('accélère la vis quand le cycle raccourcit', () => {
    const fast = deriveMachineSignals({ ...base, cycleTimeSeconds: 20 });
    const slow = deriveMachineSignals({ ...base, cycleTimeSeconds: 120 });
    expect(fast.screwSpeedRpm).toBeGreaterThan(slow.screwSpeedRpm);
  });

  it('cumule la consommation sur la fenêtre demandée', () => {
    const day = deriveMachineSignals(base);
    const hour = deriveMachineSignals({ ...base, windowHours: 1 });
    expect(day.consumption.electricityKwh).toBeCloseTo(hour.consumption.electricityKwh * 24, 0);
  });
});

describe('toProcessSignalList', () => {
  it('borne le remplissage des barres entre 0 et 100', () => {
    const rows = toProcessSignalList(deriveMachineSignals(base));
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(row.fillPct).toBeGreaterThanOrEqual(0);
      expect(row.fillPct).toBeLessThanOrEqual(100);
    }
  });

  it('signale un niveau d’huile bas en critique', () => {
    const rows = toProcessSignalList({ ...deriveMachineSignals(base), oilLevelOk: false });
    const oil = rows.find((row) => row.key === 'oil-level');
    expect(oil?.display).toBe('Bas');
    expect(oil?.tone).toBe('critical');
  });
});

describe('splitAvailability', () => {
  it('sépare production, arrêts planifiés et arrêts subis', () => {
    const split = splitAvailability(
      [
        { status: 'production', durationMinutes: 1_125 },
        { status: 'setup', durationMinutes: 195 },
        { status: 'fault', durationMinutes: 120 },
      ],
      1_440,
    );

    expect(split.productiveMinutes).toBe(1_125);
    expect(split.plannedStopMinutes).toBe(195);
    expect(split.unplannedStopMinutes).toBe(120);
    expect(split.productivePct).toBeCloseTo(78.1, 1);
  });

  it('rattache le temps non couvert par un événement aux arrêts subis', () => {
    const split = splitAvailability([{ status: 'production', durationMinutes: 600 }], 1_440);
    expect(split.unplannedStopMinutes).toBe(840);
    expect(split.totalMinutes).toBe(1_440);
  });

  it('ne perd aucune minute quand les événements dépassent la fenêtre', () => {
    const split = splitAvailability([{ status: 'production', durationMinutes: 1_500 }], 1_440);
    expect(split.totalMinutes).toBe(1_500);
    expect(split.productivePct).toBe(100);
  });
});

describe('buildHourlyProduction', () => {
  const minutes = Array.from({ length: 24 }, (_, hour) => (hour >= 6 && hour < 18 ? 60 : 0));

  it('conserve exactement les totaux réels', () => {
    const series = buildHourlyProduction({
      productiveMinutesByHour: minutes,
      goodUnits: 12_456,
      rejectedUnits: 98,
      targetUnits: 15_000,
      maxHourlyCapacity: 0,
      windowStartMs: 0,
      todayStartMs: 24 * 3_600_000,
    });

    expect(series).toHaveLength(24);
    expect(series.reduce((sum, point) => sum + point.goodUnits, 0)).toBe(12_456);
    expect(series.reduce((sum, point) => sum + point.rejectedUnits, 0)).toBe(98);
  });

  it("n’attribue rien aux heures sans production", () => {
    const series = buildHourlyProduction({
      productiveMinutesByHour: minutes,
      goodUnits: 1_200,
      rejectedUnits: 0,
      targetUnits: 1_500,
      maxHourlyCapacity: 0,
      windowStartMs: 0,
      todayStartMs: 24 * 3_600_000,
    });

    expect(series[3].goodUnits).toBe(0);
    expect(series[10].goodUnits).toBeGreaterThan(0);
  });

  it("ne divise pas par zéro sur une journée sans production", () => {
    const series = buildHourlyProduction({
      productiveMinutesByHour: Array(24).fill(0),
      goodUnits: 0,
      rejectedUnits: 0,
      targetUnits: 15_000,
      maxHourlyCapacity: 0,
      windowStartMs: 0,
      todayStartMs: 24 * 3_600_000,
    });

    expect(series.every((point) => point.goodUnits === 0 && point.targetUnits === 0)).toBe(true);
  });
});

describe('productiveShareSeries', () => {
  it('convertit des minutes en part horaire bornée', () => {
    const series = productiveShareSeries([60, 30, 0, 90]);
    expect(series.slice(0, 4)).toEqual([100, 50, 0, 100]);
    expect(series).toHaveLength(24);
  });
});
