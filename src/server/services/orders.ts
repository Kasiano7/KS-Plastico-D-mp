import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { computeOrderProgress, estimateDelayRisk, riskSeverity, assessFeasibility, type FeasibilityCheck } from '../domain/orders';
import { availableQuantity, planReservation } from '../domain/inventory';
import { rankMachinesForJob } from '../domain/machines';
import type { Severity } from '@/components/ui/severity';

/** Heures de production disponibles avant échéance (21 h/jour d'ouverture). */
function availableHoursUntil(due: Date, now: Date, hoursPerDay = 21): number {
  const ms = due.getTime() - now.getTime();
  return ms <= 0 ? 0 : (ms / 86_400_000) * hoursPerDay;
}

export type OrderListItem = {
  id: string;
  number: string;
  customerName: string;
  status: string;
  priority: string;
  orderedAt: Date;
  dueAt: Date;
  quantityUnits: number;
  coveredUnits: number;
  progressPct: number;
  palletsReady: number;
  palletsRequired: number;
  riskPct: number;
  severity: Severity;
  valueCents: number;
  productNames: string[];
};

export async function listOrders(): Promise<OrderListItem[]> {
  const db = await getDb();
  const now = new Date();

  const rows = await db
    .select({
      id: t.customerOrders.id,
      number: t.customerOrders.number,
      status: t.customerOrders.status,
      priority: t.customerOrders.priority,
      orderedAt: t.customerOrders.orderedAt,
      dueAt: t.customerOrders.dueAt,
      customerName: t.customers.name,
    })
    .from(t.customerOrders)
    .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
    .orderBy(t.customerOrders.dueAt);

  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
  const [lines, productionOrders] = await Promise.all([
    db
      .select({
        orderId: t.orderLines.orderId,
        quantityUnits: t.orderLines.quantityUnits,
        reservedUnits: t.orderLines.reservedUnits,
        producedUnits: t.orderLines.producedUnits,
        unitPriceCents: t.orderLines.unitPriceCents,
        unitsPerPallet: t.products.unitsPerPallet,
        productName: t.products.name,
      })
      .from(t.orderLines)
      .innerJoin(t.products, eq(t.orderLines.productId, t.products.id))
      .where(inArray(t.orderLines.orderId, orderIds)),
    db
      .select({
        customerOrderId: t.productionOrders.customerOrderId,
        plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
        machineId: t.productionOrders.machineId,
        machineStatus: t.machines.status,
      })
      .from(t.productionOrders)
      .leftJoin(t.machines, eq(t.productionOrders.machineId, t.machines.id))
      .where(inArray(t.productionOrders.customerOrderId, orderIds)),
  ]);

  return rows.map((row) => {
    const orderLines = lines.filter((line) => line.orderId === row.id);
    const progress = computeOrderProgress(orderLines);
    const related = productionOrders.filter((po) => po.customerOrderId === row.id);
    const unitsPerHour =
      related.length > 0
        ? related.reduce((total, po) => total + po.plannedUnitsPerHour, 0) / related.length
        : 60;
    const blockedMachines = new Set(
      related
        .filter((po) => po.machineStatus === 'stopped' || po.machineStatus === 'fault')
        .map((po) => po.machineId),
    ).size;

    const closed = row.status === 'shipped' || row.status === 'cancelled' || row.status === 'ready';
    const risk = closed
      ? { riskPct: 0, reasons: [] }
      : estimateDelayRisk({
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
      orderedAt: row.orderedAt,
      dueAt: row.dueAt,
      quantityUnits: progress.quantityUnits,
      coveredUnits: progress.coveredUnits,
      progressPct: progress.progressPct,
      palletsReady: progress.palletsReady,
      palletsRequired: progress.palletsRequired,
      riskPct: risk.riskPct,
      severity: riskSeverity(risk.riskPct) as Severity,
      valueCents: orderLines.reduce((total, line) => total + line.quantityUnits * line.unitPriceCents, 0),
      productNames: [...new Set(orderLines.map((line) => line.productName))],
    };
  });
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrderDetail>>>;

export async function getOrderDetail(orderId: string) {
  const db = await getDb();
  const now = new Date();

  const [row] = await db
    .select({
      order: t.customerOrders,
      customerName: t.customers.name,
      customerCode: t.customers.code,
    })
    .from(t.customerOrders)
    .innerJoin(t.customers, eq(t.customerOrders.customerId, t.customers.id))
    .where(eq(t.customerOrders.id, orderId))
    .limit(1);

  if (!row) return null;

  const [lines, productionOrders, pallets, reservations] = await Promise.all([
    db
      .select({
        id: t.orderLines.id,
        quantityUnits: t.orderLines.quantityUnits,
        reservedUnits: t.orderLines.reservedUnits,
        producedUnits: t.orderLines.producedUnits,
        unitPriceCents: t.orderLines.unitPriceCents,
        productId: t.products.id,
        productName: t.products.name,
        productReference: t.products.reference,
        unitsPerPallet: t.products.unitsPerPallet,
        unitCostCents: t.products.unitCostCents,
      })
      .from(t.orderLines)
      .innerJoin(t.products, eq(t.orderLines.productId, t.products.id))
      .where(eq(t.orderLines.orderId, orderId)),
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        status: t.productionOrders.status,
        quantityUnits: t.productionOrders.quantityUnits,
        producedUnits: t.productionOrders.producedUnits,
        plannedStartAt: t.productionOrders.plannedStartAt,
        plannedEndAt: t.productionOrders.plannedEndAt,
        plannedUnitsPerHour: t.productionOrders.plannedUnitsPerHour,
        machineName: t.machines.name,
        machineId: t.machines.id,
        machineStatus: t.machines.status,
        productName: t.products.name,
      })
      .from(t.productionOrders)
      .leftJoin(t.machines, eq(t.productionOrders.machineId, t.machines.id))
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .where(eq(t.productionOrders.customerOrderId, orderId))
      .orderBy(t.productionOrders.plannedStartAt),
    db
      .select({
        id: t.pallets.id,
        code: t.pallets.code,
        status: t.pallets.status,
        quantityUnits: t.pallets.quantityUnits,
        lotNumber: t.pallets.lotNumber,
        completedAt: t.pallets.completedAt,
        machineName: t.machines.name,
        productId: t.products.id,
        productName: t.products.name,
        productReference: t.products.reference,
      })
      .from(t.pallets)
      .leftJoin(t.machines, eq(t.pallets.machineId, t.machines.id))
      .innerJoin(t.products, eq(t.pallets.productId, t.products.id))
      .where(eq(t.pallets.customerOrderId, orderId))
      .orderBy(desc(t.pallets.completedAt)),
    db
      .select({
        quantity: t.inventoryReservations.quantity,
        status: t.inventoryReservations.status,
        createdAt: t.inventoryReservations.createdAt,
        itemName: t.inventoryItems.name,
        itemSku: t.inventoryItems.sku,
      })
      .from(t.inventoryReservations)
      .innerJoin(t.inventoryItems, eq(t.inventoryReservations.itemId, t.inventoryItems.id))
      .where(eq(t.inventoryReservations.customerOrderId, orderId)),
  ]);

  const progress = computeOrderProgress(lines);
  const unitsPerHour =
    productionOrders.length > 0
      ? productionOrders.reduce((total, po) => total + po.plannedUnitsPerHour, 0) / productionOrders.length
      : 60;
  // Deux ordres sur la même presse arrêtée ne comptent que pour une machine bloquée.
  const blockedMachines = new Set(
    productionOrders
      .filter((po) => po.machineStatus === 'stopped' || po.machineStatus === 'fault')
      .map((po) => po.machineId),
  ).size;

  const risk = estimateDelayRisk({
    remainingUnits: progress.remainingUnits,
    unitsPerHour,
    availableHours: availableHoursUntil(row.order.dueAt, now),
    blockedMachines,
  });

  const checks: FeasibilityCheck[] = [
    {
      key: 'machine',
      label: 'Machine',
      status: blockedMachines > 0 ? 'blocked' : productionOrders.length > 0 ? 'ok' : 'warning',
      detail:
        blockedMachines > 0
          ? `${blockedMachines} machine(s) affectée(s) à l'arrêt`
          : productionOrders.length > 0
            ? `${productionOrders.length} ordre(s) de fabrication planifié(s)`
            : 'Aucun ordre de fabrication planifié',
    },
    {
      key: 'pallets',
      label: 'Palettes',
      status: progress.palletsReady >= progress.palletsRequired ? 'ok' : 'warning',
      detail: `${progress.palletsReady} / ${progress.palletsRequired} palettes prêtes`,
    },
    {
      key: 'planning',
      label: 'Planning',
      status: risk.missingHours > 0 ? 'blocked' : risk.riskPct >= 20 ? 'warning' : 'ok',
      detail:
        risk.missingHours > 0
          ? `${risk.missingHours.toLocaleString('fr-FR')} h manquantes avant échéance`
          : `${risk.availableHours.toLocaleString('fr-FR')} h disponibles pour ${risk.requiredHours.toLocaleString('fr-FR')} h nécessaires`,
    },
  ];

  return {
    ...row.order,
    customerName: row.customerName,
    customerCode: row.customerCode,
    lines,
    productionOrders,
    pallets,
    reservations,
    progress,
    risk,
    severity: riskSeverity(risk.riskPct) as Severity,
    feasibility: assessFeasibility(risk, checks),
    valueCents: lines.reduce((total, line) => total + line.quantityUnits * line.unitPriceCents, 0),
    marginCents: lines.reduce(
      (total, line) => total + line.quantityUnits * (line.unitPriceCents - line.unitCostCents),
      0,
    ),
  };
}

/* ────────────────────────────── Analyse de faisabilité à la création ──── */

export type FeasibilityPreview = {
  productName: string;
  quantityUnits: number;
  availableStock: number;
  reservable: number;
  toProduce: number;
  palletsRequired: number;
  machineOptions: { machineCode: string; totalHoursNeeded: number; fits: boolean; isOperational: boolean }[];
  requiredHours: number;
  availableHours: number;
  riskPct: number;
  severity: Severity;
  verdict: 'feasible' | 'feasible_with_risk' | 'not_feasible';
  checks: FeasibilityCheck[];
};

/**
 * Analyse de faisabilité (§18) exécutée avant de confirmer une commande.
 * Mobilise stock, palettes, compatibilité machine et capacité restante.
 */
export async function previewFeasibility(
  productId: string,
  quantityUnits: number,
  dueAt: Date,
): Promise<FeasibilityPreview | null> {
  const db = await getDb();
  const now = new Date();

  const [product] = await db.select().from(t.products).where(eq(t.products.id, productId)).limit(1);
  if (!product) return null;

  const [stockItem] = await db
    .select()
    .from(t.inventoryItems)
    .where(and(eq(t.inventoryItems.productId, productId), eq(t.inventoryItems.kind, 'finished_good')))
    .limit(1);

  const level = stockItem
    ? {
        quantityOnHand: stockItem.quantityOnHand,
        quantityReserved: stockItem.quantityReserved,
        safetyStock: stockItem.safetyStock,
      }
    : { quantityOnHand: 0, quantityReserved: 0, safetyStock: 0 };

  const plan = planReservation(level, quantityUnits);

  const compatibilities = await db
    .select({
      machineId: t.machines.id,
      machineCode: t.machines.code,
      unitsPerHour: t.productMachines.unitsPerHour,
      isPreferred: t.productMachines.isPreferred,
      status: t.machines.status,
      currentMoldId: t.machines.currentMoldId,
      dailyCapacityHours: t.machines.dailyCapacityHours,
    })
    .from(t.productMachines)
    .innerJoin(t.machines, eq(t.productMachines.machineId, t.machines.id))
    .where(eq(t.productMachines.productId, productId));

  const [mold] = product.moldId
    ? await db.select().from(t.molds).where(eq(t.molds.id, product.moldId)).limit(1)
    : [null];

  const daysUntilDue = Math.max((dueAt.getTime() - now.getTime()) / 86_400_000, 0);

  const ranking = rankMachinesForJob(
    compatibilities.map((machine) => ({
      machineId: machine.machineId,
      machineCode: machine.machineCode,
      unitsPerHour: machine.unitsPerHour,
      isPreferred: machine.isPreferred,
      moldAlreadyMounted: machine.currentMoldId === product.moldId,
      // Hypothèse V1 : 45 % de la capacité machine est libre sur la période.
      freeHours: daysUntilDue * machine.dailyCapacityHours * 0.45,
      isOperational: machine.status !== 'stopped' && machine.status !== 'fault',
      changeoverMinutes: mold?.changeoverMinutes ?? 180,
    })),
    plan.missing,
  );

  const best = ranking[0];
  const availableHours = best ? daysUntilDue * 21 * 0.45 : 0;
  const risk = estimateDelayRisk({
    remainingUnits: plan.missing,
    unitsPerHour: best?.unitsPerHour ?? 60,
    availableHours,
    blockedMachines: ranking.filter((machine) => !machine.isOperational).length > 0 && ranking.every((m) => !m.fits) ? 1 : 0,
    materialShortage: false,
  });

  const palletItem = await db
    .select()
    .from(t.inventoryItems)
    .where(eq(t.inventoryItems.kind, 'pallet'))
    .limit(1);
  const palletsRequired = Math.ceil(quantityUnits / product.unitsPerPallet);
  const palletsAvailable = palletItem[0] ? availableQuantity(palletItem[0]) : 0;

  const checks: FeasibilityCheck[] = [
    {
      key: 'material',
      label: 'Stock produit fini',
      status: plan.fullyCovered ? 'ok' : plan.reserved > 0 ? 'warning' : 'warning',
      detail: `${plan.reserved.toLocaleString('fr-FR')} pièce(s) réservables, ${plan.missing.toLocaleString('fr-FR')} à produire`,
    },
    {
      key: 'pallets',
      label: 'Palettes',
      status: palletsAvailable >= palletsRequired ? 'ok' : 'warning',
      detail: `${palletsRequired} palette(s) nécessaires, ${palletsAvailable} disponible(s)`,
    },
    {
      key: 'machine',
      label: 'Machine compatible',
      status: ranking.some((machine) => machine.isOperational)
        ? 'ok'
        : ranking.length > 0
          ? 'blocked'
          : 'blocked',
      detail:
        ranking.length === 0
          ? 'Aucune machine compatible déclarée pour cette pièce'
          : ranking.some((machine) => machine.isOperational)
            ? `${ranking.filter((machine) => machine.isOperational).length} machine(s) opérationnelle(s)`
            : 'Toutes les machines compatibles sont à l’arrêt',
    },
    {
      key: 'planning',
      label: 'Capacité avant échéance',
      status: best?.fits ? 'ok' : risk.riskPct >= 60 ? 'blocked' : 'warning',
      detail: best
        ? `${best.totalHoursNeeded.toLocaleString('fr-FR')} h nécessaires sur ${best.machineCode} pour ${Math.round(availableHours)} h disponibles`
        : 'Aucun créneau exploitable',
    },
  ];

  const feasibility = assessFeasibility(risk, checks);

  return {
    productName: product.name,
    quantityUnits,
    availableStock: availableQuantity(level),
    reservable: plan.reserved,
    toProduce: plan.missing,
    palletsRequired,
    machineOptions: ranking.map((machine) => ({
      machineCode: machine.machineCode,
      totalHoursNeeded: machine.totalHoursNeeded,
      fits: machine.fits,
      isOperational: machine.isOperational,
    })),
    requiredHours: risk.requiredHours,
    availableHours: risk.availableHours,
    riskPct: risk.riskPct,
    severity: riskSeverity(risk.riskPct) as Severity,
    verdict: feasibility.verdict,
    checks,
  };
}
