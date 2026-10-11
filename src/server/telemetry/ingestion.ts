import 'server-only';

import { and, desc, eq, inArray, isNull, like, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { createAbruptStopRecords } from '../services/machine-stop';
import { recordAudit } from '../services/audit';
import type { SessionUser } from '../auth/session';

const machineStatusSchema = z.enum([
  'production',
  'setup',
  'mold_change',
  'stopped',
  'fault',
  'maintenance',
  'idle',
]);

export const gatewayPayloadSchema = z.object({
  gatewayId: z.string().trim().min(1).max(80),
  simulation: z.boolean().optional().default(false),
  readings: z
    .array(
      z.object({
        machineCode: z.string().trim().min(1).max(40),
        recordedAt: z.iso.datetime({ offset: true }),
        status: machineStatusSchema,
        cycleTimeSeconds: z.number().positive().max(3_600).nullable(),
        partsProduced: z.number().int().min(0).max(2_000_000_000),
        partsRejected: z.number().int().min(0).max(2_000_000_000),
        availabilityPct: z.number().min(0).max(100),
        performancePct: z.number().min(0).max(200),
        qualityPct: z.number().min(0).max(100),
        moldReference: z.string().trim().min(1).max(40).nullable().optional(),
        reason: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export type GatewayPayload = z.infer<typeof gatewayPayloadSchema>;

const STATUS_TO_EVENT = {
  production: 'production_start',
  setup: 'setup',
  mold_change: 'mold_change',
  stopped: 'stop',
  fault: 'fault',
  maintenance: 'maintenance',
  idle: 'restart',
} as const;

const GATEWAY_USER: SessionUser = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'passerelle@demo.example',
  fullName: 'Passerelle machines',
  roleId: '00000000-0000-0000-0000-000000000000',
  role: 'machine_gateway',
  roleLabel: 'Passerelle machines',
  workshopId: null,
  employeeId: null,
  permissions: [],
};

export type IngestionResult = {
  accepted: number;
  duplicates: number;
  unknownMachines: string[];
  stateChanges: number;
  moldChanges: number;
  rejectedMolds: { machineCode: string; moldReference: string }[];
  simulatedOrders: {
    machineCode: string;
    orderNumber: string;
    productReference: string;
    productName: string;
  }[];
};

type SimulatedOrder = IngestionResult['simulatedOrders'][number] & {
  id: string;
  quantityUnits: number;
  producedUnits: number;
  rejectedUnits: number;
};

/** Même définition du « jour » que les lectures aujourd'hui de l'application. */
function startOfLocalDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function syncSimulatedProductionOrder({
  db,
  machine,
  status,
  recordedAt,
}: {
  db: Awaited<ReturnType<typeof getDb>>;
  machine: typeof t.machines.$inferSelect;
  status: z.infer<typeof machineStatusSchema>;
  recordedAt: Date;
}): Promise<SimulatedOrder | null> {
  const orderPattern = `SIM-${machine.code}-%`;

  if (status !== 'production' || !machine.currentMoldId) {
    await db
      .update(t.productionOrders)
      .set({ status: 'paused' })
      .where(
        and(
          eq(t.productionOrders.machineId, machine.id),
          like(t.productionOrders.number, orderPattern),
          eq(t.productionOrders.status, 'running'),
        ),
      );
    return null;
  }

  const [compatibleProduct] = await db
    .select({
      id: t.products.id,
      reference: t.products.reference,
      name: t.products.name,
      unitsPerHour: t.productMachines.unitsPerHour,
    })
    .from(t.productMachines)
    .innerJoin(t.products, eq(t.productMachines.productId, t.products.id))
    .where(
      and(
        eq(t.productMachines.machineId, machine.id),
        eq(t.products.moldId, machine.currentMoldId),
      ),
    )
    .limit(1);

  if (!compatibleProduct) return null;

  const [existingOrder] = await db
    .select()
    .from(t.productionOrders)
    .where(
      and(
        eq(t.productionOrders.machineId, machine.id),
        eq(t.productionOrders.productId, compatibleProduct.id),
        eq(t.productionOrders.moldId, machine.currentMoldId),
        like(t.productionOrders.number, orderPattern),
        inArray(t.productionOrders.status, ['planned', 'released', 'running', 'paused']),
      ),
    )
    .orderBy(desc(t.productionOrders.createdAt))
    .limit(1);

  if (existingOrder) {
    await db
      .update(t.productionOrders)
      .set({ status: 'paused' })
      .where(
        and(
          eq(t.productionOrders.machineId, machine.id),
          like(t.productionOrders.number, orderPattern),
          eq(t.productionOrders.status, 'running'),
          ne(t.productionOrders.id, existingOrder.id),
        ),
      );

    const orderUpdates: Partial<typeof t.productionOrders.$inferInsert> = {};
    if (existingOrder.status !== 'running') {
      orderUpdates.status = 'running';
      orderUpdates.actualStartAt = existingOrder.actualStartAt ?? recordedAt;
      orderUpdates.actualEndAt = null;
    }
    // Un OF simulé reste ouvert tant que la presse produit : sans ce recalage,
    // il sort de la fenêtre « aujourd'hui » lue par tous les écrans de
    // l'application (tableau de bord, fiche machine, parc machines) dès le
    // passage de minuit côté serveur, alors que producedUnits continue
    // d'augmenter en base.
    if (startOfLocalDay(existingOrder.plannedStartAt).getTime() !== startOfLocalDay(recordedAt).getTime()) {
      orderUpdates.plannedStartAt = recordedAt;
      orderUpdates.plannedEndAt = new Date(recordedAt.getTime() + 24 * 60 * 60 * 1_000);
    }
    if (Object.keys(orderUpdates).length > 0) {
      await db.update(t.productionOrders).set(orderUpdates).where(eq(t.productionOrders.id, existingOrder.id));
    }

    return {
      id: existingOrder.id,
      machineCode: machine.code,
      orderNumber: existingOrder.number,
      productReference: compatibleProduct.reference,
      productName: compatibleProduct.name,
      quantityUnits: existingOrder.quantityUnits,
      producedUnits: existingOrder.producedUnits,
      rejectedUnits: existingOrder.rejectedUnits,
    };
  }

  await db
    .update(t.productionOrders)
    .set({ status: 'paused' })
    .where(
      and(
        eq(t.productionOrders.machineId, machine.id),
        like(t.productionOrders.number, orderPattern),
        eq(t.productionOrders.status, 'running'),
      ),
    );

  const plannedEndAt = new Date(recordedAt.getTime() + 24 * 60 * 60 * 1_000);
  const [createdOrder] = await db
    .insert(t.productionOrders)
    .values({
      number: `SIM-${machine.code}-${recordedAt.getTime()}`,
      productId: compatibleProduct.id,
      machineId: machine.id,
      moldId: machine.currentMoldId,
      status: 'running',
      quantityUnits: 100_000,
      plannedStartAt: recordedAt,
      plannedEndAt,
      actualStartAt: recordedAt,
      plannedUnitsPerHour: compatibleProduct.unitsPerHour,
      requiresMoldChange: 'OF généré automatiquement par le simulateur',
    })
    .returning();

  return {
    id: createdOrder.id,
    machineCode: machine.code,
    orderNumber: createdOrder.number,
    productReference: compatibleProduct.reference,
    productName: compatibleProduct.name,
    quantityUnits: createdOrder.quantityUnits,
    producedUnits: createdOrder.producedUnits,
    rejectedUnits: createdOrder.rejectedUnits,
  };
}

export async function ingestGatewayPayload(payload: GatewayPayload): Promise<IngestionResult> {
  const db = await getDb();
  const codes = [...new Set(payload.readings.map((reading) => reading.machineCode))];
  const machines = await db.select().from(t.machines).where(inArray(t.machines.code, codes));
  const machinesByCode = new Map(machines.map((machine) => [machine.code, machine]));
  const unknownMachines = codes.filter((code) => !machinesByCode.has(code));

  let accepted = 0;
  let duplicates = 0;
  let stateChanges = 0;
  let moldChanges = 0;
  const rejectedMolds: IngestionResult['rejectedMolds'] = [];
  const simulatedOrders: IngestionResult['simulatedOrders'] = [];

  for (const reading of payload.readings) {
    const machine = machinesByCode.get(reading.machineCode);
    if (!machine) continue;

    const recordedAt = new Date(reading.recordedAt);
    const [previousTelemetry] = await db
      .select({
        recordedAt: t.machineTelemetry.recordedAt,
        partsProduced: t.machineTelemetry.partsProduced,
        partsRejected: t.machineTelemetry.partsRejected,
      })
      .from(t.machineTelemetry)
      .where(eq(t.machineTelemetry.machineId, machine.id))
      .orderBy(desc(t.machineTelemetry.recordedAt))
      .limit(1);

    const inserted = await db
      .insert(t.machineTelemetry)
      .values({
        machineId: machine.id,
        recordedAt,
        cycleTimeSeconds: reading.cycleTimeSeconds,
        partsProduced: reading.partsProduced,
        partsRejected: reading.partsRejected,
        availabilityPct: reading.availabilityPct,
        performancePct: reading.performancePct,
        qualityPct: reading.qualityPct,
        source: payload.simulation ? 'simulated' : 'gateway',
      })
      .onConflictDoNothing({
        target: [t.machineTelemetry.machineId, t.machineTelemetry.recordedAt],
      })
      .returning({ id: t.machineTelemetry.id });

    if (inserted.length === 0) {
      duplicates += 1;
      continue;
    }
    accepted += 1;

    // Un lot retardé reste archivé, mais ne doit jamais remettre la machine
    // dans un ancien état ni fausser les compteurs de production.
    if (previousTelemetry && previousTelemetry.recordedAt > recordedAt) continue;

    if (reading.moldReference !== undefined) {
      const selectedMold = reading.moldReference
        ? (
            await db
              .select({ id: t.molds.id, reference: t.molds.reference })
              .from(t.moldMachines)
              .innerJoin(t.molds, eq(t.moldMachines.moldId, t.molds.id))
              .where(
                and(
                  eq(t.moldMachines.machineId, machine.id),
                  eq(t.molds.reference, reading.moldReference),
                ),
              )
              .limit(1)
          )[0]
        : null;

      if (reading.moldReference && !selectedMold) {
        rejectedMolds.push({
          machineCode: machine.code,
          moldReference: reading.moldReference,
        });
      } else {
        const nextMoldId = selectedMold?.id ?? null;
        if (machine.currentMoldId !== nextMoldId) {
          await db
            .update(t.machines)
            .set({ currentMoldId: nextMoldId })
            .where(eq(t.machines.id, machine.id));

          await recordAudit({
            userLabel: `Passerelle ${payload.gatewayId}`,
            action: 'machine.mold_change',
            entityType: 'machine',
            entityId: machine.id,
            entityLabel: machine.name,
            previousValue: { currentMoldId: machine.currentMoldId },
            newValue: {
              currentMoldId: nextMoldId,
              moldReference: selectedMold?.reference ?? null,
              source: 'gateway',
            },
            justification: 'Sélection depuis le simulateur de presses',
          });

          machine.currentMoldId = nextMoldId;
          moldChanges += 1;
        }
      }
    }

    const simulatedOrder = payload.simulation
      ? await syncSimulatedProductionOrder({ db, machine, status: reading.status, recordedAt })
      : null;

    if (simulatedOrder) simulatedOrders.push(simulatedOrder);

    if (previousTelemetry) {
      const producedDelta = Math.max(reading.partsProduced - previousTelemetry.partsProduced, 0);
      const rejectedDelta = Math.max(reading.partsRejected - previousTelemetry.partsRejected, 0);
      if (producedDelta > 0 || rejectedDelta > 0) {
        const [currentOrder] = payload.simulation
          ? [simulatedOrder]
          : await db
              .select()
              .from(t.productionOrders)
              .where(
                and(
                  eq(t.productionOrders.machineId, machine.id),
                  inArray(t.productionOrders.status, ['running', 'paused']),
                ),
              )
              .orderBy(desc(t.productionOrders.plannedStartAt))
              .limit(1);

        if (currentOrder) {
          await db
            .update(t.productionOrders)
            .set({
              producedUnits: Math.min(
                currentOrder.quantityUnits,
                currentOrder.producedUnits + producedDelta,
              ),
              rejectedUnits: currentOrder.rejectedUnits + rejectedDelta,
            })
            .where(eq(t.productionOrders.id, currentOrder.id));
        }
      }
    }

    if (machine.status !== reading.status) {
      const [openEvent] = await db
        .select()
        .from(t.machineEvents)
        .where(and(eq(t.machineEvents.machineId, machine.id), isNull(t.machineEvents.endedAt)))
        .orderBy(desc(t.machineEvents.startedAt))
        .limit(1);

      if (openEvent) {
        await db
          .update(t.machineEvents)
          .set({
            endedAt: recordedAt,
            durationMinutes: Math.max(
              Math.round((recordedAt.getTime() - openEvent.startedAt.getTime()) / 60_000),
              0,
            ),
          })
          .where(eq(t.machineEvents.id, openEvent.id));
      }

      await db.insert(t.machineEvents).values({
        machineId: machine.id,
        type: STATUS_TO_EVENT[reading.status],
        status: reading.status,
        startedAt: recordedAt,
        reason: reading.reason ?? null,
        source: 'gateway',
        metadata: { gatewayId: payload.gatewayId },
      });

      await db
        .update(t.machines)
        .set({ status: reading.status, statusSince: recordedAt })
        .where(eq(t.machines.id, machine.id));

      const abruptStop =
        (reading.status === 'stopped' || reading.status === 'fault') &&
        machine.status !== 'stopped' &&
        machine.status !== 'fault';
      if (abruptStop) {
        await createAbruptStopRecords({
          db,
          machine,
          user: GATEWAY_USER,
          reason: reading.reason ?? undefined,
          occurredAt: recordedAt,
        });
      }

      await recordAudit({
        userLabel: `Passerelle ${payload.gatewayId}`,
        action: 'machine.status_change',
        entityType: 'machine',
        entityId: machine.id,
        entityLabel: machine.name,
        previousValue: { status: machine.status, since: machine.statusSince },
        newValue: { status: reading.status, since: recordedAt, source: 'gateway' },
        justification: reading.reason ?? null,
      });

      machine.status = reading.status;
      machine.statusSince = recordedAt;
      stateChanges += 1;
    }
  }

  return {
    accepted,
    duplicates,
    unknownMachines,
    stateChanges,
    moldChanges,
    rejectedMolds,
    simulatedOrders,
  };
}
