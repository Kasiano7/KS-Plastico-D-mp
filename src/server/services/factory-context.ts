import 'server-only';

import { cache } from 'react';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  computeFactoryHealth,
  explainHealthVariation,
  healthSeverity,
  type HealthInput,
  type HealthResult,
} from '../domain/health-score';
import { computeOee, machineSeverity } from '../domain/machines';
import { availableQuantity, projectStock } from '../domain/inventory';
import { computeOrderProgress, estimateDelayRisk, riskSeverity } from '../domain/orders';
import { checkQualification } from '../domain/staffing';
import type { Severity } from '@/components/ui/severity';

/**
 * FactoryContextBuilder (§40).
 *
 * Construit **une seule** photographie structurée de l'usine, réutilisée par :
 *  - la Control Tower,
 *  - les pages de synthèse,
 *  - le copilote IA.
 *
 * Conséquence directe : l'IA et l'interface ne peuvent pas raconter deux
 * histoires différentes, puisqu'elles lisent le même objet.
 */

export type NextMoldChange = {
  /** Instant planifié du prochain ordre nécessitant un autre moule. */
  at: Date;
  fromMoldReference: string | null;
  toMoldReference: string;
  productionOrderNumber: string;
};

export type MachineSnapshot = {
  id: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  tonnage: number;
  workshopId: string;
  workshopName: string;
  status: string;
  severity: Severity;
  statusSince: Date;
  downtimeMinutes: number;
  plannedMinutes: number;
  producedUnits: number;
  rejectedUnits: number;
  oeePct: number;
  hourlyCostCents: number;
  currentOrderNumber: string | null;
  currentProductName: string | null;
  currentMoldReference: string | null;
  reason: string | null;
  /** Part productive mesurée dans douze tranches de la journée. */
  activitySeries: number[];
  /**
   * Prochain changement de moule planifié sur cette presse — `null` si aucun
   * ordre à venir n'utilise un autre moule que celui actuellement monté (§20).
   */
  nextMoldChange: NextMoldChange | null;
};

function productiveActivitySeries(
  events: { status: string; startedAt: Date; endedAt: Date | null }[],
  dayStart: Date,
  now: Date,
): number[] {
  const bucketCount = 12;
  const elapsed = Math.max(now.getTime() - dayStart.getTime(), 1);
  const bucketDuration = elapsed / bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = dayStart.getTime() + index * bucketDuration;
    const bucketEnd = bucketStart + bucketDuration;
    const productiveMs = events.reduce((total, event) => {
      if (event.status !== 'production') return total;
      const start = Math.max(event.startedAt.getTime(), bucketStart);
      const end = Math.min((event.endedAt ?? now).getTime(), bucketEnd);
      return total + Math.max(end - start, 0);
    }, 0);
    return Math.round((productiveMs / bucketDuration) * 100);
  });
}

export type OrderSnapshot = {
  id: string;
  number: string;
  customerName: string;
  status: string;
  priority: string;
  dueAt: Date;
  quantityUnits: number;
  coveredUnits: number;
  remainingUnits: number;
  progressPct: number;
  palletsReady: number;
  palletsRequired: number;
  riskPct: number;
  severity: Severity;
  riskReasons: string[];
  isLate: boolean;
  productNames: string[];
  /** Ateliers impliqués via les OF rattachés, pour le cloisonnement IA. */
  workshopIds: string[];
};

export type InventorySnapshot = {
  id: string;
  sku: string;
  name: string;
  kind: string;
  unit: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  safetyStock: number;
  reorderPoint: number;
  averageDailyConsumption: number;
  coverageDays: number;
  shortageInDays: number | null;
  severity: Severity;
};

export type WorkshopSnapshot = {
  id: string;
  code: string;
  name: string;
  targetUnits: number;
  producedUnits: number;
  achievementPct: number;
  severity: Severity;
  machinesDown: number;
  machinesTotal: number;
};

export type FactoryContext = {
  capturedAt: Date;
  dayStart: Date;
  health: HealthResult;
  healthSeverity: Severity;
  healthVariation: string | null;
  previousGlobalScore: number | null;
  production: {
    producedUnits: number;
    targetUnits: number;
    achievementPct: number;
    rejectedUnits: number;
    scrapRatePct: number;
  };
  workshops: WorkshopSnapshot[];
  machines: MachineSnapshot[];
  planning: {
    id: string;
    number: string;
    status: string;
    machineId: string | null;
    workshopId: string | null;
    productName: string;
    moldReference: string | null;
    plannedStartAt: Date;
    plannedEndAt: Date;
    plannedUnitsPerHour: number;
    producedUnits: number;
    customerOrderId: string | null;
  }[];
  orders: OrderSnapshot[];
  inventory: InventorySnapshot[];
  staff: {
    required: number;
    present: number;
    /** Effectif actif minimal, pour répondre « X est-il présent ? » sans deviner. */
    roster: { fullName: string; workshopName: string | null; isAbsent: boolean }[];
    absentToday: { fullName: string; workshopName: string | null; reason: string | null }[];
    expiringQualifications: {
      id: string;
      employeeId: string;
      fullName: string;
      label: string;
      daysRemaining: number;
      status: 'expiring' | 'expired';
    }[];
  };
  alerts: {
    id: string;
    severity: Severity;
    domain: string;
    title: string;
    impactCents: number;
    detectedAt: Date;
    workshopId: string | null;
  }[];
  healthInput: HealthInput;
};

const RISK_THRESHOLD_PCT = 20;

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Heures de production restantes avant une échéance, à 21 h/jour ouvré. */
function availableHoursUntil(due: Date, now: Date, hoursPerDay = 21): number {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 0;
  const days = ms / 86_400_000;
  return Math.max(days * hoursPerDay, 0);
}

export const getFactoryContext = cache(async (): Promise<FactoryContext> => {
  const db = await getDb();
  const now = new Date();
  const dayStart = startOfDay(now);

  const [workshopRows, machineRows, eventRows, productionOrderRows, orderRows, inventoryRows, moldRows] =
    await Promise.all([
      db.select().from(t.workshops).orderBy(t.workshops.code),
      db
        .select({
          id: t.machines.id,
          code: t.machines.code,
          name: t.machines.name,
          manufacturer: t.machines.manufacturer,
          model: t.machines.model,
          tonnage: t.machines.tonnage,
          status: t.machines.status,
          statusSince: t.machines.statusSince,
          hourlyCostCents: t.machines.hourlyCostCents,
          workshopId: t.machines.workshopId,
          workshopName: t.workshops.name,
          isActive: t.machines.isActive,
          currentMoldId: t.machines.currentMoldId,
        })
        .from(t.machines)
        .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
        .orderBy(t.machines.code),
      db
        .select()
        .from(t.machineEvents)
        .where(gte(t.machineEvents.startedAt, dayStart))
        .orderBy(t.machineEvents.startedAt),
      db
        .select({
          id: t.productionOrders.id,
          number: t.productionOrders.number,
          machineId: t.productionOrders.machineId,
          moldId: t.productionOrders.moldId,
          status: t.productionOrders.status,
          producedUnits: t.productionOrders.producedUnits,
          rejectedUnits: t.productionOrders.rejectedUnits,
          plannedStartAt: t.productionOrders.plannedStartAt,
          plannedEndAt: t.productionOrders.plannedEndAt,
          plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
          customerOrderId: t.productionOrders.customerOrderId,
          productName: t.products.name,
          productCycleTimeSeconds: t.products.cycleTimeSeconds,
        })
        .from(t.productionOrders)
        .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id)),
      db
        .select({
          id: t.customerOrders.id,
          number: t.customerOrders.number,
          status: t.customerOrders.status,
          priority: t.customerOrders.priority,
          dueAt: t.customerOrders.dueAt,
          customerName: t.customers.name,
        })
        .from(t.customerOrders)
        .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
        .orderBy(t.customerOrders.dueAt),
      db.select().from(t.inventoryItems).orderBy(t.inventoryItems.kind, t.inventoryItems.name),
      db.select({ id: t.molds.id, reference: t.molds.reference }).from(t.molds),
    ]);

  const moldReferenceById = new Map(moldRows.map((mold) => [mold.id, mold.reference]));

  /* ─────────────────────────────────────────────── Machines & ateliers ─── */

  const eventsByMachine = new Map<string, typeof eventRows>();
  for (const event of eventRows) {
    const list = eventsByMachine.get(event.machineId);
    if (list) list.push(event);
    else eventsByMachine.set(event.machineId, [event]);
  }

  const todaysProductionOrders = productionOrderRows.filter(
    (row) => row.plannedStartAt >= dayStart && row.plannedStartAt < new Date(dayStart.getTime() + 86_400_000),
  );

  /**
   * Premier ordre à venir, pas encore lancé, dont le moule diffère de celui
   * actuellement monté (§20) — c'est cet instant qui constitue le prochain
   * changement de moule planifié, pas une estimation.
   */
  function findNextMoldChange(machineId: string, currentMoldId: string | null): NextMoldChange | null {
    const upcoming = productionOrderRows
      .filter(
        (order) =>
          order.machineId === machineId &&
          order.moldId !== null &&
          (order.status === 'planned' || order.status === 'released'),
      )
      .sort((a, b) => a.plannedStartAt.getTime() - b.plannedStartAt.getTime());

    const changeOrder = upcoming.find((order) => order.moldId !== currentMoldId);
    if (!changeOrder?.moldId) return null;

    return {
      at: changeOrder.plannedStartAt,
      fromMoldReference: currentMoldId ? (moldReferenceById.get(currentMoldId) ?? null) : null,
      toMoldReference: moldReferenceById.get(changeOrder.moldId) ?? changeOrder.moldId,
      productionOrderNumber: changeOrder.number,
    };
  }

  const machines: MachineSnapshot[] = machineRows
    .filter((row) => row.isActive)
    .map((row) => {
      const events = eventsByMachine.get(row.id) ?? [];
      let plannedMinutes = 0;
      let downtimeMinutes = 0;
      let reason: string | null = null;

      for (const event of events) {
        const end = event.endedAt ?? now;
        const minutes = Math.max(Math.round((end.getTime() - event.startedAt.getTime()) / 60_000), 0);
        plannedMinutes += minutes;
        if (event.status === 'stopped' || event.status === 'fault') downtimeMinutes += minutes;
        if (!event.endedAt) reason = event.reason;
      }

      const machineOrders = todaysProductionOrders.filter((order) => order.machineId === row.id);
      const producedUnits = machineOrders.reduce((total, order) => total + order.producedUnits, 0);
      const rejectedUnits = machineOrders.reduce((total, order) => total + order.rejectedUnits, 0);
      const running = machineOrders.find((order) => order.status === 'running' || order.status === 'paused');

      const oee = computeOee({
        plannedMinutes,
        downtimeMinutes,
        goodUnits: producedUnits,
        rejectedUnits,
        idealCycleTimeSeconds: running?.productCycleTimeSeconds ?? 60,
      });

      return {
        id: row.id,
        code: row.code,
        name: row.name,
        manufacturer: row.manufacturer,
        model: row.model,
        tonnage: row.tonnage,
        workshopId: row.workshopId,
        workshopName: row.workshopName,
        status: row.status,
        severity: machineSeverity(row.status) as Severity,
        statusSince: row.statusSince,
        downtimeMinutes,
        plannedMinutes,
        producedUnits,
        rejectedUnits,
        oeePct: oee.oeePct,
        hourlyCostCents: row.hourlyCostCents,
        currentOrderNumber: running?.number ?? null,
        currentProductName: running?.productName ?? null,
        currentMoldReference: row.currentMoldId ? (moldReferenceById.get(row.currentMoldId) ?? null) : null,
        reason,
        activitySeries: productiveActivitySeries(events, dayStart, now),
        nextMoldChange: findNextMoldChange(row.id, row.currentMoldId),
      };
    });

  const workshops: WorkshopSnapshot[] = workshopRows.map((workshop) => {
    const workshopMachines = machines.filter((machine) => machine.workshopId === workshop.id);
    const producedUnits = workshopMachines.reduce((total, machine) => total + machine.producedUnits, 0);
    const achievementPct =
      workshop.dailyTargetUnits > 0
        ? Math.round((producedUnits / workshop.dailyTargetUnits) * 100)
        : 100;

    return {
      id: workshop.id,
      code: workshop.code,
      name: workshop.name,
      targetUnits: workshop.dailyTargetUnits,
      producedUnits,
      achievementPct,
      severity:
        achievementPct >= 95
          ? 'normal'
          : achievementPct >= 85
            ? 'info'
            : achievementPct >= 70
              ? 'warning'
              : 'critical',
      machinesDown: workshopMachines.filter((machine) => machine.severity === 'critical').length,
      machinesTotal: workshopMachines.length,
    };
  });

  /* ────────────────────────────────────────────────────────── Commandes ─── */

  const activeStatuses = ['confirmed', 'in_production', 'ready'] as const;
  const activeOrderIds = orderRows
    .filter((row) => (activeStatuses as readonly string[]).includes(row.status))
    .map((row) => row.id);

  const lineRows =
    activeOrderIds.length > 0
      ? await db
          .select({
            orderId: t.orderLines.orderId,
            quantityUnits: t.orderLines.quantityUnits,
            reservedUnits: t.orderLines.reservedUnits,
            producedUnits: t.orderLines.producedUnits,
            unitsPerPallet: t.products.unitsPerPallet,
            productName: t.products.name,
            productId: t.products.id,
          })
          .from(t.orderLines)
          .innerJoin(t.products, eq(t.orderLines.productId, t.products.id))
          .where(inArray(t.orderLines.orderId, activeOrderIds))
      : [];

  const machineById = new Map(machines.map((machine) => [machine.id, machine]));

  const orders: OrderSnapshot[] = orderRows
    .filter((row) => (activeStatuses as readonly string[]).includes(row.status))
    .map((row) => {
      const lines = lineRows.filter((line) => line.orderId === row.id);
      const progress = computeOrderProgress(lines);

      // La cadence retenue est celle des OF planifiés pour cette commande.
      const relatedProductionOrders = productionOrderRows.filter(
        (productionOrder) => productionOrder.customerOrderId === row.id,
      );
      const unitsPerHour =
        relatedProductionOrders.length > 0
          ? relatedProductionOrders.reduce((total, order) => total + order.plannedUnitsPerHour, 0) /
            relatedProductionOrders.length
          : 60;

      const blockedMachines = new Set(
        relatedProductionOrders
          .map((productionOrder) => productionOrder.machineId)
          .filter((machineId): machineId is string => Boolean(machineId))
          .filter((machineId) => machineById.get(machineId)?.severity === 'critical'),
      ).size;

      const risk = estimateDelayRisk({
        remainingUnits: progress.remainingUnits,
        unitsPerHour,
        availableHours: availableHoursUntil(row.dueAt, now),
        blockedMachines,
      });

      return {
        id: row.id,
        number: row.number,
        customerName: row.customerName,
        status: row.status,
        priority: row.priority,
        dueAt: row.dueAt,
        quantityUnits: progress.quantityUnits,
        coveredUnits: progress.coveredUnits,
        remainingUnits: progress.remainingUnits,
        progressPct: progress.progressPct,
        palletsReady: progress.palletsReady,
        palletsRequired: progress.palletsRequired,
        riskPct: risk.riskPct,
        severity: riskSeverity(risk.riskPct) as Severity,
        riskReasons: risk.reasons,
        isLate: row.dueAt < now && row.status !== 'ready',
        productNames: [...new Set(lines.map((line) => line.productName))],
        workshopIds: [
          ...new Set(
            relatedProductionOrders
              .map((productionOrder) =>
                productionOrder.machineId
                  ? machineById.get(productionOrder.machineId)?.workshopId
                  : undefined,
              )
              .filter((workshopId): workshopId is string => Boolean(workshopId)),
          ),
        ],
      };
    });

  /* ───────────────────────────────────────────────────────────── Stocks ─── */

  const inventory: InventorySnapshot[] = inventoryRows.map((row) => {
    const level = {
      quantityOnHand: row.quantityOnHand,
      quantityReserved: row.quantityReserved,
      safetyStock: row.safetyStock,
    };
    const projection = projectStock({
      level,
      averageDailyConsumption: row.averageDailyConsumption,
      horizonDays: 7,
    });

    // Une rupture ne concerne que ce qui s'achète. Un produit fini se
    // réapprovisionne par la production : son manque est un problème de
    // planning, traité par le risque de retard des commandes, pas ici.
    const isPurchased = row.kind !== 'finished_good';
    const shortage = isPurchased ? projection.shortageInDays : null;

    const severity: Severity =
      shortage !== null && shortage <= 1
        ? 'critical'
        : shortage !== null && shortage <= 3
          ? 'warning'
          : row.quantityOnHand <= row.reorderPoint
            ? 'info'
            : 'normal';

    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      kind: row.kind,
      unit: row.unit,
      quantityOnHand: row.quantityOnHand,
      quantityReserved: row.quantityReserved,
      available: availableQuantity(level),
      safetyStock: row.safetyStock,
      reorderPoint: row.reorderPoint,
      averageDailyConsumption: row.averageDailyConsumption,
      coverageDays: Number.isFinite(projection.coverageDays) ? projection.coverageDays : 999,
      shortageInDays: shortage,
      severity,
    };
  });

  /* ────────────────────────────────────────────────────────── Personnel ─── */

  const [employeeRows, absenceRows, qualificationRows] = await Promise.all([
    db
      .select({
        id: t.employees.id,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        workshopName: t.workshops.name,
        isActive: t.employees.isActive,
      })
      .from(t.employees)
      .leftJoin(t.workshops, eq(t.employees.workshopId, t.workshops.id)),
    db
      .select({
        employeeId: t.absences.employeeId,
        reason: t.absences.reason,
      })
      .from(t.absences)
      .where(and(lte(t.absences.startsAt, now), gte(t.absences.endsAt, now))),
    db
      .select({
        id: t.qualifications.id,
        employeeId: t.qualifications.employeeId,
        label: t.qualifications.label,
        expiresAt: t.qualifications.expiresAt,
        alertLeadDays: t.qualifications.alertLeadDays,
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
      })
      .from(t.qualifications)
      .innerJoin(t.employees, eq(t.qualifications.employeeId, t.employees.id)),
  ]);

  const activeEmployees = employeeRows.filter((row) => row.isActive);
  const absentIds = new Set(absenceRows.map((row) => row.employeeId));
  const absentToday = activeEmployees
    .filter((row) => absentIds.has(row.id))
    .map((row) => ({
      fullName: `${row.firstName} ${row.lastName}`,
      workshopName: row.workshopName,
      reason: absenceRows.find((absence) => absence.employeeId === row.id)?.reason ?? null,
    }));

  const expiringQualifications = qualificationRows
    .map((row) => ({
      ...row,
      check: checkQualification(row.expiresAt, now, row.alertLeadDays),
    }))
    .filter((row) => row.check.status !== 'valid')
    .map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      fullName: `${row.firstName} ${row.lastName}`,
      label: row.label,
      daysRemaining: row.check.daysRemaining ?? 0,
      status: row.check.status as 'expiring' | 'expired',
    }))
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  /* ────────────────────────────────────────────────────────── Alertes ──── */

  const alertRows = await db
    .select({
      id: t.alerts.id,
      severity: t.alerts.severity,
      domain: t.alerts.domain,
      title: t.alerts.title,
      impactCents: t.alerts.impactCents,
      detectedAt: t.alerts.detectedAt,
      workshopId: t.alerts.workshopId,
    })
    .from(t.alerts)
    .where(eq(t.alerts.status, 'open'))
    .orderBy(desc(t.alerts.detectedAt));

  /* ──────────────────────────────────────────────── Score de santé ────── */

  const producedUnits = workshops.reduce((total, workshop) => total + workshop.producedUnits, 0);
  const targetUnits = workshops.reduce((total, workshop) => total + workshop.targetUnits, 0);
  const rejectedUnits = machines.reduce((total, machine) => total + machine.rejectedUnits, 0);

  const healthInput: HealthInput = {
    production: { producedUnits, targetUnits },
    machines: {
      total: machines.length,
      down: machines.filter((machine) => machine.severity === 'critical').length,
      downtimeMinutes: machines.reduce((total, machine) => total + machine.downtimeMinutes, 0),
      plannedMinutes: machines.reduce((total, machine) => total + machine.plannedMinutes, 0),
    },
    inventory: {
      trackedItems: inventory.length,
      belowReorderPoint: inventory.filter((item) => item.quantityOnHand <= item.reorderPoint).length,
      projectedShortages: inventory.filter(
        (item) => item.shortageInDays !== null && item.shortageInDays <= 3,
      ).length,
    },
    planning: {
      activeOrders: orders.length,
      ordersAtRisk: orders.filter((order) => order.riskPct >= RISK_THRESHOLD_PCT).length,
      ordersLate: orders.filter((order) => order.isLate).length,
    },
    quality: { goodUnits: producedUnits, rejectedUnits },
    staff: {
      required: activeEmployees.length,
      present: activeEmployees.length - absentToday.length,
      expiringQualifications: expiringQualifications.length,
    },
  };

  const health = computeFactoryHealth(healthInput);

  const [previousSnapshot] = await db
    .select()
    .from(t.healthSnapshots)
    .orderBy(desc(t.healthSnapshots.capturedAt))
    .limit(1);

  let healthVariation: string | null = null;
  if (previousSnapshot) {
    const previous: HealthResult = {
      global: previousSnapshot.globalScore,
      dimensions: health.dimensions.map((dimension) => ({
        ...dimension,
        score: {
          production: previousSnapshot.productionScore,
          inventory: previousSnapshot.inventoryScore,
          machines: previousSnapshot.machineScore,
          planning: previousSnapshot.planningScore,
          quality: previousSnapshot.qualityScore,
          staff: previousSnapshot.staffScore,
        }[dimension.dimension],
      })),
      weakest: [],
    };
    healthVariation = explainHealthVariation(previous, health);
  }

  const totalUnits = producedUnits + rejectedUnits;

  return {
    capturedAt: now,
    dayStart,
    health,
    healthSeverity: healthSeverity(health.global) as Severity,
    healthVariation,
    previousGlobalScore: previousSnapshot?.globalScore ?? null,
    production: {
      producedUnits,
      targetUnits,
      achievementPct: targetUnits > 0 ? Math.round((producedUnits / targetUnits) * 100) : 100,
      rejectedUnits,
      scrapRatePct: totalUnits > 0 ? Math.round((rejectedUnits / totalUnits) * 1000) / 10 : 0,
    },
    workshops,
    machines,
    planning: productionOrderRows.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      machineId: order.machineId,
      workshopId: order.machineId ? (machineById.get(order.machineId)?.workshopId ?? null) : null,
      productName: order.productName,
      moldReference: order.moldId ? (moldReferenceById.get(order.moldId) ?? null) : null,
      plannedStartAt: order.plannedStartAt,
      plannedEndAt: order.plannedEndAt,
      plannedUnitsPerHour: order.plannedUnitsPerHour,
      producedUnits: order.producedUnits,
      customerOrderId: order.customerOrderId,
    })),
    orders,
    inventory,
    staff: {
      required: activeEmployees.length,
      present: activeEmployees.length - absentToday.length,
      roster: activeEmployees.map((row) => ({
        fullName: `${row.firstName} ${row.lastName}`,
        workshopName: row.workshopName,
        isAbsent: absentIds.has(row.id),
      })),
      absentToday,
      expiringQualifications,
    },
    alerts: alertRows.map((row) => ({
      id: row.id,
      severity: row.severity as Severity,
      domain: row.domain,
      title: row.title,
      impactCents: row.impactCents,
      detectedAt: row.detectedAt,
      workshopId: row.workshopId,
    })),
    healthInput,
  };
});

/** Petites requêtes annexes utilisées par le shell. */
export async function getOpenAlertCount(): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.alerts)
    .where(eq(t.alerts.status, 'open'));
  return row?.count ?? 0;
}

export async function getNotificationsFor(roleCode: string, userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(t.notifications)
    .where(
      and(
        or(eq(t.notifications.roleCode, roleCode), eq(t.notifications.userId, userId)),
        isNull(t.notifications.readAt),
      ),
    )
    .orderBy(desc(t.notifications.createdAt))
    .limit(10);
}
