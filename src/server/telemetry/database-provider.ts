import 'server-only';

import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { MachineTelemetryProvider, TelemetryReading } from './provider';

/** Lit uniquement les relevés récents reçus d'une passerelle. */
export class DatabaseTelemetryProvider implements MachineTelemetryProvider {
  readonly id = 'gateway';
  readonly label = 'Passerelle machines';

  async read(machineId: string): Promise<TelemetryReading | null> {
    const [reading] = await this.readMany([machineId]);
    return reading ?? null;
  }

  async readMany(machineIds: readonly string[]): Promise<TelemetryReading[]> {
    if (machineIds.length === 0) return [];

    const maxAgeSeconds = Math.max(
      Number(process.env.MACHINE_TELEMETRY_MAX_AGE_SECONDS ?? 30) || 30,
      5,
    );
    const freshSince = new Date(Date.now() - maxAgeSeconds * 1_000);
    const db = await getDb();
    const rows = await db
      .select()
      .from(t.machineTelemetry)
      .where(
        and(
          inArray(t.machineTelemetry.machineId, [...machineIds]),
          gte(t.machineTelemetry.recordedAt, freshSince),
          eq(t.machineTelemetry.source, 'gateway'),
        ),
      )
      .orderBy(desc(t.machineTelemetry.recordedAt));

    const latestByMachine = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByMachine.has(row.machineId)) latestByMachine.set(row.machineId, row);
    }

    return [...latestByMachine.values()].map((row) => ({
      machineId: row.machineId,
      recordedAt: row.recordedAt,
      cycleTimeSeconds: row.cycleTimeSeconds,
      unitsPerHour: row.cycleTimeSeconds ? round1(3_600 / row.cycleTimeSeconds) : 0,
      partsProduced: row.partsProduced,
      partsRejected: row.partsRejected,
      source: row.source,
    }));
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
