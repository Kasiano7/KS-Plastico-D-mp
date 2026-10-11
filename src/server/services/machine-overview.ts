import 'server-only';

import { and, asc, desc, eq, gte, isNull, or, sum } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { MACHINE_STATUS_LABELS, computeOee, machineSeverity, oeeVerdict } from '../domain/machines';
import {
  buildHourlyProduction,
  splitAvailability,
  toProcessSignalList,
  type AvailabilitySplit,
  type HourlyProductionPoint,
  type MachineSignals,
  type ProcessSignal,
} from '../domain/machine-signals';
import { getProcessSignalsProvider } from '../telemetry/process-signals';
import { getTelemetryProvider } from '../telemetry/simulated-provider';
import {
  eventDurationMinutes,
  machineImageKey,
  machinePhotoUrl,
  productiveMinutesByHour,
  type MachineImageKey,
} from './machine-fleet';
import type { Severity } from '@/components/ui/severity';

/**
 * Fiche machine — vue d'ensemble (§29, §30).
 *
 * Une seule lecture composée alimente tout l'écran : en-tête, bandeau
 * principal, production 24 h, état process, consommations, disponibilité,
 * derniers arrêts, plaque signalétique et prochaine maintenance.
 */

export type MachineStopEntry = {
  id: string;
  label: string;
  reason: string | null;
  startedAt: Date;
  durationMinutes: number;
  severity: Severity;
  planned: boolean;
};

export type MachineOverview = {
  capturedAt: Date;
  id: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  tonnage: number;
  /** Coût horaire machine réel, en centimes (0 si non renseigné). */
  hourlyCostCents: number;
  workshopName: string;
  imageKey: MachineImageKey;
  photoUrl: string | null;

  status: string;
  statusLabel: string;
  severity: Severity;
  statusSince: Date;

  oee: ReturnType<typeof computeOee>;
  /** Qualification métier du TRS, affichée sous la jauge. */
  oeeVerdict: { label: string; severity: Severity };
  cycleTimeSeconds: number | null;
  /** Vrai si `cycleTimeSeconds` vient d'une passerelle réelle, faux si simulé. */
  cycleTimeMeasured: boolean;
  theoreticalCycleSeconds: number | null;

  startedBy: string | null;
  shiftLabel: string | null;

  production: {
    goodUnits: number;
    rejectedUnits: number;
    rejectRatePct: number;
    /** Total de toutes les commandes pour la pièce en cours de fabrication. */
    targetUnits: number;
    achievementPct: number;
    /** Capacité horaire théorique maximale (pièces/h), 0 si inconnue. */
    maxHourlyCapacity: number;
    hourly: HourlyProductionPoint[];
  };

  currentOrder: {
    number: string;
    productReference: string;
    productName: string;
    material: string | null;
    color: string | null;
    partWeightGrams: number;
    cavities: number | null;
  } | null;

  signals: MachineSignals;
  signalRows: ProcessSignal[];
  signalsProviderLabel: string;
  signalsMeasured: boolean;

  availability: AvailabilitySplit;
  recentStops: MachineStopEntry[];

  nameplate: {
    serialNumber: string | null;
    manufacturingYear: number | null;
    totalHours: number | null;
    productionHours: number | null;
    controlSoftware: string | null;
    controlSoftwareVersion: string | null;
  };

  nextMaintenance: {
    id: string;
    title: string;
    scheduledAt: Date;
    daysAhead: number;
    /** Heures machine restantes avant l'échéance, si le compteur est connu. */
    remainingHours: number | null;
  } | null;
};

const EVENT_LABELS: Record<string, string> = {
  production_start: 'Démarrage de production',
  production_end: 'Fin de production',
  stop: 'Arrêt',
  setup: 'Réglage',
  mold_change: 'Changement de moule',
  fault: 'Défaut',
  maintenance: 'Maintenance',
  restart: 'Remise en service',
};

const PLANNED_STOP_STATUSES = new Set(['setup', 'mold_change', 'maintenance']);

const SHIFT_LABELS: Record<string, string> = {
  morning: 'Équipe A (Matin)',
  afternoon: 'Équipe B (Soir)',
  night: 'Équipe C (Nuit)',
};

export async function getMachineOverview(machineId: string): Promise<MachineOverview | null> {
  const db = await getDb();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  // Fenêtre glissante 24 h pour le graphique : de l'heure courante - 24 h à maintenant.
  const currentHourMs = Math.floor(now.getTime() / 3_600_000) * 3_600_000;
  const windowStart = new Date(currentHourMs - 24 * 3_600_000);

  const [row] = await db
    .select({
      machine: t.machines,
      workshopName: t.workshops.name,
      workshopTargetUnits: t.workshops.dailyTargetUnits,
      moldCavities: t.molds.cavities,
    })
    .from(t.machines)
    .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
    .leftJoin(t.molds, eq(t.machines.currentMoldId, t.molds.id))
    .where(eq(t.machines.id, machineId))
    .limit(1);

  if (!row) return null;
  const machine = row.machine;

  const [events, orders, runs, assignedEmployees, maintenanceTasks, signalsMap, telemetry] = await Promise.all([
    // Fenêtre 24 h glissante : sert à la fois au graphique et, filtrée, aux stats du jour.
    db
      .select()
      .from(t.machineEvents)
      .where(and(eq(t.machineEvents.machineId, machineId), gte(t.machineEvents.startedAt, windowStart)))
      .orderBy(asc(t.machineEvents.startedAt)),
    db
      .select({
        order: t.productionOrders,
        productReference: t.products.reference,
        productName: t.products.name,
        productWeightGrams: t.products.weightGrams,
        productCycleTimeSeconds: t.products.cycleTimeSeconds,
        materialName: t.materials.name,
        materialColor: t.materials.color,
        moldCavities: t.molds.cavities,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .leftJoin(t.materials, eq(t.products.materialId, t.materials.id))
      .leftJoin(t.molds, eq(t.products.moldId, t.molds.id))
      .where(and(eq(t.productionOrders.machineId, machineId), gte(t.productionOrders.plannedStartAt, dayStart))),
    db
      .select({
        startedAt: t.productionRuns.startedAt,
        operatorFirstName: t.employees.firstName,
        operatorLastName: t.employees.lastName,
        operatorShift: t.employees.shift,
      })
      .from(t.productionRuns)
      .leftJoin(t.employees, eq(t.productionRuns.operatorId, t.employees.id))
      .where(eq(t.productionRuns.machineId, machineId))
      .orderBy(desc(t.productionRuns.startedAt))
      .limit(1),
    // Repli sur l'affectation de planning courante (§19) quand aucune session
    // de production réelle n'a encore été journalisée pour cette presse : une
    // décision de planning réelle, pas une valeur inventée.
    db
      .select({ firstName: t.employees.firstName, lastName: t.employees.lastName, shift: t.employees.shift })
      .from(t.employees)
      .where(and(eq(t.employees.assignedMachineId, machineId), eq(t.employees.isActive, true)))
      .limit(1),
    db
      .select()
      .from(t.maintenanceTasks)
      .where(
        and(
          eq(t.maintenanceTasks.machineId, machineId),
          or(isNull(t.maintenanceTasks.completedAt), gte(t.maintenanceTasks.scheduledAt, now)),
        ),
      )
      .orderBy(asc(t.maintenanceTasks.scheduledAt))
      .limit(5),
    getProcessSignalsProvider().readMany([machineId], 24),
    getTelemetryProvider().read(machineId),
  ]);

  const timeline = events.map((event) => ({
    id: event.id,
    type: event.type,
    status: event.status,
    reason: event.reason,
    startedAt: event.startedAt,
    durationMinutes: eventDurationMinutes(event, now),
  }));

  // Les stats du jour (TRS, arrêts récents) n'utilisent que les events d'aujourd'hui.
  const todayTimeline = timeline.filter((entry) => entry.startedAt >= dayStart);

  // La répartition ne couvre que le temps réellement journalisé : inventer des
  // minutes d'ouverture non observées fausserait le taux de disponibilité.
  const availability = splitAvailability(todayTimeline, 0);

  const goodUnits = orders.reduce((total, entry) => total + entry.order.producedUnits, 0);
  const rejectedUnits = orders.reduce((total, entry) => total + entry.order.rejectedUnits, 0);

  const current =
    orders.find((entry) => entry.order.status === 'running') ??
    orders.find((entry) => entry.order.status === 'paused') ??
    null;

  // Objectif = total de TOUTES les commandes pour la pièce en cours, pas seulement du jour.
  const [productObjectiveRow] = current
    ? await db
        .select({ total: sum(t.orderLines.quantityUnits) })
        .from(t.orderLines)
        .where(eq(t.orderLines.productId, current.order.productId))
    : [{ total: '0' }];
  const targetUnits = Number(productObjectiveRow?.total ?? 0);

  // Capacité max horaire : (3600 / temps de cycle théorique) × nombre d'empreintes.
  const cycleSeconds = current?.productCycleTimeSeconds ?? null;
  const cavities = current?.moldCavities ?? row.moldCavities ?? 1;
  const maxHourlyCapacity =
    cycleSeconds && cycleSeconds > 0 ? Math.round((3600 / cycleSeconds) * (cavities ?? 1)) : 0;

  const oee = computeOee({
    plannedMinutes: availability.totalMinutes,
    downtimeMinutes: availability.unplannedStopMinutes + availability.plannedStopMinutes,
    goodUnits,
    rejectedUnits,
    idealCycleTimeSeconds: current?.productCycleTimeSeconds ?? 60,
  });

  const hourly = buildHourlyProduction({
    productiveMinutesByHour: productiveMinutesByHour(events, windowStart, now),
    goodUnits,
    rejectedUnits,
    targetUnits,
    maxHourlyCapacity,
    windowStartMs: windowStart.getTime(),
    todayStartMs: dayStart.getTime(),
  });

  const recentStops: MachineStopEntry[] = todayTimeline
    .filter((entry) => entry.status !== 'production' && entry.status !== 'idle')
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      label: EVENT_LABELS[entry.type] ?? entry.type,
      reason: entry.reason,
      startedAt: entry.startedAt,
      durationMinutes: entry.durationMinutes,
      severity: machineSeverity(entry.status) as Severity,
      planned: PLANNED_STOP_STATUSES.has(entry.status),
    }));

  const nextTask = maintenanceTasks.find((task) => task.completedAt === null) ?? null;
  const assignedEmployee = assignedEmployees[0] ?? null;
  const signals = signalsMap.get(machineId)!;
  const provider = getProcessSignalsProvider();
  const run = runs[0] ?? null;

  return {
    capturedAt: now,
    id: machine.id,
    code: machine.code,
    name: machine.name,
    manufacturer: machine.manufacturer,
    model: machine.model,
    tonnage: machine.tonnage,
    hourlyCostCents: machine.hourlyCostCents,
    workshopName: row.workshopName,
    imageKey: machineImageKey(machine.manufacturer, machine.model),
    photoUrl: machinePhotoUrl(machine.photoId),

    status: machine.status,
    statusLabel: MACHINE_STATUS_LABELS[machine.status] ?? machine.status,
    severity: machineSeverity(machine.status) as Severity,
    statusSince: machine.statusSince,

    oee,
    oeeVerdict: oeeVerdict(oee.oeePct),
    cycleTimeSeconds: telemetry?.cycleTimeSeconds ?? null,
    cycleTimeMeasured: telemetry?.source === 'gateway' || telemetry?.source === 'manual',
    theoreticalCycleSeconds: current?.productCycleTimeSeconds ?? null,

    // À défaut de session réelle journalisée, on retombe sur l'opérateur
    // affecté à cette presse pour la période en cours (§19) — mais seulement
    // si la presse produit réellement : une affectation de planning n'est pas
    // la preuve qu'un poste a été pris, elle ne vaut que tant que ça tourne.
    startedBy:
      run?.operatorFirstName && run.operatorLastName
        ? `${run.operatorFirstName} ${run.operatorLastName}`
        : machine.status === 'production' && assignedEmployee
          ? `${assignedEmployee.firstName} ${assignedEmployee.lastName}`
          : null,
    shiftLabel: (() => {
      const shift = run?.operatorShift ?? assignedEmployee?.shift ?? null;
      return shift ? (SHIFT_LABELS[shift] ?? shift) : null;
    })(),

    production: {
      goodUnits,
      rejectedUnits,
      rejectRatePct:
        goodUnits + rejectedUnits > 0
          ? Math.round((rejectedUnits / (goodUnits + rejectedUnits)) * 10_000) / 100
          : 0,
      targetUnits,
      achievementPct: targetUnits > 0 ? Math.round((goodUnits / targetUnits) * 100) : 0,
      maxHourlyCapacity,
      hourly,
    },

    currentOrder: current
      ? {
          number: current.order.number,
          productReference: current.productReference,
          productName: current.productName,
          material: current.materialName,
          color: current.materialColor,
          partWeightGrams: current.productWeightGrams,
          cavities: current.moldCavities ?? row.moldCavities,
        }
      : null,

    signals,
    signalRows: toProcessSignalList(signals),
    signalsProviderLabel: provider.label,
    signalsMeasured: provider.measured,

    availability,
    recentStops,

    nameplate: {
      serialNumber: machine.serialNumber,
      manufacturingYear: machine.manufacturingYear,
      totalHours: machine.totalHours,
      productionHours: machine.productionHours,
      controlSoftware: machine.controlSoftware,
      controlSoftwareVersion: machine.controlSoftwareVersion,
    },

    nextMaintenance: nextTask
      ? {
          id: nextTask.id,
          title: nextTask.title,
          scheduledAt: nextTask.scheduledAt,
          daysAhead: Math.max(
            Math.ceil((nextTask.scheduledAt.getTime() - now.getTime()) / 86_400_000),
            0,
          ),
          // Heures d'ouverture restantes d'ici l'échéance, à capacité constante.
          remainingHours:
            machine.dailyCapacityHours > 0
              ? Math.max(
                  Math.round(
                    ((nextTask.scheduledAt.getTime() - now.getTime()) / 86_400_000) *
                      machine.dailyCapacityHours,
                  ),
                  0,
                )
              : null,
        }
      : null,
  };
}
