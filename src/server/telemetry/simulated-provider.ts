import 'server-only';

import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { MachineTelemetryProvider, TelemetryReading } from './provider';
import { DatabaseTelemetryProvider } from './database-provider';

/**
 * Implémentation simulée : elle ne se connecte à aucune machine.
 *
 * Les relevés sont **dérivés des données réelles de l'application** (état de la
 * machine, ordre en cours, cadence planifiée) et non tirés au hasard : deux
 * lectures successives restent cohérentes entre elles et avec le reste de
 * l'interface. Le bruit appliqué est déterministe, fondé sur l'identifiant de
 * la machine et la minute courante — le rendu serveur et le rendu client
 * produisent donc la même valeur.
 */
export class SimulatedTelemetryProvider implements MachineTelemetryProvider {
  readonly id = 'simulated';
  readonly label = 'Télémétrie simulée (aucune passerelle connectée)';

  async read(machineId: string): Promise<TelemetryReading | null> {
    const [reading] = await this.readMany([machineId]);
    return reading ?? null;
  }

  async readMany(machineIds: readonly string[]): Promise<TelemetryReading[]> {
    if (machineIds.length === 0) return [];

    const db = await getDb();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const [machines, orders] = await Promise.all([
      db
        .select({ id: t.machines.id, status: t.machines.status })
        .from(t.machines)
        .where(inArray(t.machines.id, [...machineIds])),
      db
        .select({
          machineId: t.productionOrders.machineId,
          plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
          producedUnits: t.productionOrders.producedUnits,
          rejectedUnits: t.productionOrders.rejectedUnits,
          cycleTimeSeconds: t.products.cycleTimeSeconds,
        })
        .from(t.productionOrders)
        .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
        .where(
          and(
            inArray(t.productionOrders.machineId, [...machineIds]),
            inArray(t.productionOrders.status, ['running', 'paused']),
            gte(t.productionOrders.plannedStartAt, dayStart),
          ),
        )
        .orderBy(desc(t.productionOrders.plannedStartAt)),
    ]);

    return machines.map((machine) => {
      const order = orders.find((row) => row.machineId === machine.id);
      const isProducing = machine.status === 'production' && order !== undefined;

      // Variation déterministe de ±4 % : ni figée, ni aléatoire.
      const drift = deterministicDrift(machine.id, now);
      const unitsPerHour = isProducing ? round1((order?.plannedUnitsPerHour ?? 0) * (1 + drift)) : 0;

      return {
        machineId: machine.id,
        recordedAt: now,
        cycleTimeSeconds: isProducing ? round1((order?.cycleTimeSeconds ?? 0) / (1 + drift)) : null,
        unitsPerHour,
        partsProduced: order?.producedUnits ?? 0,
        partsRejected: order?.rejectedUnits ?? 0,
        source: 'simulated' as const,
      };
    });
  }
}

/** Bruit reproductible dans [-0,04 ; +0,04], stable pendant une minute. */
function deterministicDrift(machineId: string, now: Date): number {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  let hash = minuteBucket;
  for (const char of machineId) hash = (hash * 31 + char.charCodeAt(0)) % 100_003;
  return ((hash % 81) - 40) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

let provider: MachineTelemetryProvider | null = null;

class GatewayWithSimulationFallbackProvider implements MachineTelemetryProvider {
  readonly id = 'gateway-with-simulation-fallback';
  readonly label = 'Passerelle machines avec secours simulé';

  constructor(
    private readonly gateway = new DatabaseTelemetryProvider(),
    private readonly fallback = new SimulatedTelemetryProvider(),
  ) {}

  async read(machineId: string): Promise<TelemetryReading | null> {
    const [reading] = await this.readMany([machineId]);
    return reading ?? null;
  }

  async readMany(machineIds: readonly string[]): Promise<TelemetryReading[]> {
    const gatewayReadings = await this.gateway.readMany(machineIds);
    const connectedIds = new Set(gatewayReadings.map((reading) => reading.machineId));
    const missingIds = machineIds.filter((machineId) => !connectedIds.has(machineId));
    const fallbackReadings = await this.fallback.readMany(missingIds);
    return [...gatewayReadings, ...fallbackReadings];
  }
}

/**
 * Point d'accès unique. Le jour où une passerelle locale existera, seule cette
 * fonction changera.
 */
export function getTelemetryProvider(): MachineTelemetryProvider {
  provider ??= new GatewayWithSimulationFallbackProvider();
  return provider;
}
