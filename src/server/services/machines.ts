import 'server-only';

import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { computeOee, machineSeverity } from '../domain/machines';
import { DEFAULT_OPERATOR_HOURLY_COST_CENTS, computeDowntimeImpact } from '../domain/costing';
import type { Severity } from '@/components/ui/severity';

export type MachineTimelineEntry = {
  id: string;
  type: string;
  status: string;
  severity: Severity;
  startedAt: Date;
  endedAt: Date | null;
  durationMinutes: number;
  reason: string | null;
};

export async function getMachineDetail(machineId: string) {
  const db = await getDb();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({
      machine: t.machines,
      workshopName: t.workshops.name,
      workshopId: t.workshops.id,
      moldReference: t.molds.reference,
      moldName: t.molds.name,
    })
    .from(t.machines)
    .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
    .leftJoin(t.molds, eq(t.machines.currentMoldId, t.molds.id))
    .where(eq(t.machines.id, machineId))
    .limit(1);

  if (!row) return null;

  const [events, productionOrders, incidents, qualityEvents, compatibleProducts] = await Promise.all([
    db
      .select()
      .from(t.machineEvents)
      .where(and(eq(t.machineEvents.machineId, machineId), gte(t.machineEvents.startedAt, dayStart)))
      .orderBy(t.machineEvents.startedAt),
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        status: t.productionOrders.status,
        quantityUnits: t.productionOrders.quantityUnits,
        producedUnits: t.productionOrders.producedUnits,
        rejectedUnits: t.productionOrders.rejectedUnits,
        plannedStartAt: t.productionOrders.plannedStartAt,
        plannedEndAt: t.productionOrders.plannedEndAt,
        plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
        productName: t.products.name,
        productCycleTimeSeconds: t.products.cycleTimeSeconds,
        productUnitPriceCents: t.products.unitPriceCents,
        productUnitCostCents: t.products.unitCostCents,
        orderNumber: t.customerOrders.number,
        orderId: t.customerOrders.id,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .leftJoin(t.customerOrders, eq(t.productionOrders.customerOrderId, t.customerOrders.id))
      .where(eq(t.productionOrders.machineId, machineId))
      .orderBy(t.productionOrders.plannedStartAt),
    // Une entrée de plus que la page affichée sert uniquement à détecter une
    // troncature, sans repaginer ce panneau : l'historique complet existe
    // déjà, avec sa propre pagination, sur l'onglet Historique.
    db
      .select()
      .from(t.incidents)
      .where(eq(t.incidents.machineId, machineId))
      .orderBy(desc(t.incidents.occurredAt))
      .limit(11),
    db
      .select()
      .from(t.qualityEvents)
      .where(and(eq(t.qualityEvents.machineId, machineId), gte(t.qualityEvents.detectedAt, dayStart)))
      .orderBy(desc(t.qualityEvents.detectedAt)),
    db
      .select({
        productName: t.products.name,
        productReference: t.products.reference,
        unitsPerHour: t.productMachines.unitsPerHour,
        isPreferred: t.productMachines.isPreferred,
      })
      .from(t.productMachines)
      .innerJoin(t.products, eq(t.productMachines.productId, t.products.id))
      .where(eq(t.productMachines.machineId, machineId)),
  ]);

  const timeline: MachineTimelineEntry[] = events.map((event) => {
    const end = event.endedAt ?? now;
    return {
      id: event.id,
      type: event.type,
      status: event.status,
      severity: machineSeverity(event.status) as Severity,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      durationMinutes: Math.max(Math.round((end.getTime() - event.startedAt.getTime()) / 60_000), 0),
      reason: event.reason,
    };
  });

  const plannedMinutes = timeline.reduce((total, entry) => total + entry.durationMinutes, 0);
  const downtimeMinutes = timeline
    .filter((entry) => entry.status === 'stopped' || entry.status === 'fault')
    .reduce((total, entry) => total + entry.durationMinutes, 0);

  const todaysOrders = productionOrders.filter(
    (order) =>
      order.plannedStartAt >= dayStart && order.plannedStartAt < new Date(dayStart.getTime() + 86_400_000),
  );
  const producedUnits = todaysOrders.reduce((total, order) => total + order.producedUnits, 0);
  const rejectedUnits = todaysOrders.reduce((total, order) => total + order.rejectedUnits, 0);
  const current = todaysOrders.find((order) => order.status === 'running' || order.status === 'paused');

  const oee = computeOee({
    plannedMinutes,
    downtimeMinutes,
    goodUnits: producedUnits,
    rejectedUnits,
    idealCycleTimeSeconds: current?.productCycleTimeSeconds ?? 60,
  });

  const impact =
    downtimeMinutes > 0 && current
      ? computeDowntimeImpact({
          downtimeMinutes,
          unitsPerHour: current.plannedUnitsPerHour,
          unitPriceCents: current.productUnitPriceCents,
          unitCostCents: current.productUnitCostCents,
          idleOperators: 1,
          operatorHourlyCostCents: DEFAULT_OPERATOR_HOURLY_COST_CENTS,
          machineHourlyCostCents: row.machine.hourlyCostCents,
          ordersAtRisk: current.orderNumber ? 1 : 0,
        })
      : null;

  return {
    ...row.machine,
    workshopName: row.workshopName,
    workshopId: row.workshopId,
    moldReference: row.moldReference,
    moldName: row.moldName,
    severity: machineSeverity(row.machine.status) as Severity,
    timeline,
    plannedMinutes,
    downtimeMinutes,
    producedUnits,
    rejectedUnits,
    oee,
    impact,
    productionOrders,
    currentOrder: current ?? null,
    incidents: incidents.slice(0, 10),
    incidentsTruncated: incidents.length > 10,
    qualityEvents,
    compatibleProducts,
  };
}

export type MachineDetail = NonNullable<Awaited<ReturnType<typeof getMachineDetail>>>;
