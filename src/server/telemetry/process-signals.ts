import 'server-only';

import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  deriveMachineSignals,
  signalBucket,
  type MachineSignals,
} from '../domain/machine-signals';

/**
 * Signaux process d'une presse — deuxième abstraction de la passerelle (§31).
 *
 * La télémétrie « métier » (cadence, pièces) vit déjà dans
 * `MachineTelemetryProvider`. Les signaux process — pressions, températures de
 * fourreau, consommations — forment un flux distinct, beaucoup plus dense, que
 * les protocoles industriels exposent séparément :
 *
 *   Presse → OPC UA (nœuds process) / EUROMAP 77 → passerelle locale
 *          → API KS Plastico Demo → base → application
 *
 * En V1 aucune presse n'est connectée : l'implémentation simulée dérive ces
 * signaux de l'état réel de la machine, de façon déterministe. Les valeurs
 * sont donc **estimées**, jamais mesurées, et l'interface l'affiche.
 */
export interface MachineProcessSignalsProvider {
  readonly id: string;
  readonly label: string;
  /** Les signaux sont-ils réellement mesurés sur la machine ? */
  readonly measured: boolean;
  read(machineId: string, windowHours?: number): Promise<MachineSignals | null>;
  readMany(
    machineIds: readonly string[],
    windowHours?: number,
  ): Promise<Map<string, MachineSignals>>;
}

/** Une presse ne produit que dans cet état : tout le reste est un arrêt. */
function isRunning(status: string): boolean {
  return status === 'production';
}

export class SimulatedProcessSignalsProvider implements MachineProcessSignalsProvider {
  readonly id = 'simulated-process-signals';
  readonly label = 'Signaux process simulés (aucune passerelle OPC UA connectée)';
  readonly measured = false;

  async read(machineId: string, windowHours = 24): Promise<MachineSignals | null> {
    const readings = await this.readMany([machineId], windowHours);
    return readings.get(machineId) ?? null;
  }

  async readMany(
    machineIds: readonly string[],
    windowHours = 24,
  ): Promise<Map<string, MachineSignals>> {
    const signals = new Map<string, MachineSignals>();
    if (machineIds.length === 0) return signals;

    const db = await getDb();
    const now = new Date();
    const bucket = signalBucket(now);

    const [machines, runningOrders] = await Promise.all([
      db
        .select({
          id: t.machines.id,
          code: t.machines.code,
          status: t.machines.status,
          tonnage: t.machines.tonnage,
        })
        .from(t.machines)
        .where(inArray(t.machines.id, [...machineIds])),
      db
        .select({
          machineId: t.productionOrders.machineId,
          cycleTimeSeconds: t.products.cycleTimeSeconds,
        })
        .from(t.productionOrders)
        .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
        .where(inArray(t.productionOrders.status, ['running', 'paused'])),
    ]);

    for (const machine of machines) {
      const order = runningOrders.find((row) => row.machineId === machine.id);
      signals.set(
        machine.id,
        deriveMachineSignals({
          // Le code machine plutôt que l'UUID : la graine reste stable même si
          // la base est régénérée, donc les captures d'écran aussi.
          seed: machine.code,
          running: isRunning(machine.status),
          tonnage: machine.tonnage,
          cycleTimeSeconds: order?.cycleTimeSeconds ?? null,
          windowHours,
          bucket,
        }),
      );
    }

    return signals;
  }
}

let provider: MachineProcessSignalsProvider | null = null;

/** Point d'accès unique — seul endroit à changer le jour de la passerelle. */
export function getProcessSignalsProvider(): MachineProcessSignalsProvider {
  provider ??= new SimulatedProcessSignalsProvider();
  return provider;
}
