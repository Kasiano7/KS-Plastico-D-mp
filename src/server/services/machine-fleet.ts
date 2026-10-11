import 'server-only';

import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { MACHINE_STATUS_LABELS, computeOee, machineSeverity } from '../domain/machines';
import { productiveShareSeries, type MachineSignals } from '../domain/machine-signals';
import { getProcessSignalsProvider } from '../telemetry/process-signals';
import { getTelemetryProvider } from '../telemetry/simulated-provider';
import type { Severity } from '@/components/ui/severity';

/**
 * Parc machines (§29).
 *
 * Compose en une seule lecture ce que l'écran « Parc machines » affiche :
 *  - l'identité et l'état réels de la presse (base) ;
 *  - sa production du jour (ordres de fabrication réels) ;
 *  - sa courbe d'activité 24 h (événements machine réels) ;
 *  - ses signaux process (passerelle — simulés en V1).
 *
 * Aucune page ne requête la base directement : elles appellent ce service.
 */

/** Clé d'illustration — l'URL du fichier reste du ressort de l'interface. */
export type MachineImageKey = 'type-a' | 'type-b' | 'type-c';

export type MachineLinkKind = 'gateway' | 'simulated' | 'offline';

export type MachineCardModel = {
  id: string;
  code: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  tonnage: number;
  workshopId: string;
  workshopName: string;
  imageKey: MachineImageKey;
  photoUrl: string | null;
  status: string;
  statusLabel: string;
  severity: Severity;
  statusSince: Date;
  /** Libellé court de l'état process affiché en pied de carte. */
  stateLabel: string;
  /** Sévérité propre à cet état process — elle peut différer de l'état machine. */
  stateSeverity: Severity;
  oeePct: number;
  cycleTimeSeconds: number | null;
  producedUnits: number;
  rejectedUnits: number;
  moldTemperatureC: number;
  energyKwh: number;
  /** Part productive de chacune des 24 dernières heures, en pourcentage. */
  activitySeries: number[];
  /** Message affiché en bandeau rouge lorsque la presse est en défaut. */
  faultMessage: string | null;
  currentOrderNumber: string | null;
  currentProductName: string | null;
  link: MachineLinkKind;
  isActive: boolean;
};

export type MachineFleet = {
  capturedAt: Date;
  machines: MachineCardModel[];
  connectedCount: number;
  totalCount: number;
  gatewayCount: number;
  simulatedCount: number;
  /** Libellé du fournisseur de signaux process, affiché tel quel. */
  signalsProviderLabel: string;
  signalsMeasured: boolean;
};

/** L'illustration générique dépend du constructeur, jamais d'une valeur saisie à la main. */
export function machineImageKey(manufacturer: string | null, model: string | null): MachineImageKey {
  const haystack = `${manufacturer ?? ''} ${model ?? ''}`.toLowerCase();
  if (haystack.includes('presses b')) return 'type-b';
  if (haystack.includes('presses c')) return 'type-c';
  return 'type-a';
}

/** URL de la photo choisie manuellement pour cette machine (§ machine-photos.ts) — `null` si elle utilise l'illustration générique. */
export function machinePhotoUrl(photoId: string | null): string | null {
  return photoId ? `/api/machine-photos/${photoId}` : null;
}

/**
 * Minutes réellement passées en production, heure par heure sur la journée.
 *
 * La fenêtre est la journée civile (00 h → 24 h) et non les vingt-quatre
 * dernières heures glissantes : c'est l'axe que lit un chef d'atelier, et
 * c'est celui du reste de l'application. Un événement encore ouvert s'arrête
 * à l'instant présent.
 */
export function productiveMinutesByHour(
  events: readonly { status: string; startedAt: Date; endedAt: Date | null }[],
  dayStart: Date,
  now: Date,
): number[] {
  const hours = Array.from({ length: 24 }, () => 0);

  for (const event of events) {
    if (event.status !== 'production') continue;
    const start = Math.max(event.startedAt.getTime(), dayStart.getTime());
    const end = (event.endedAt ?? new Date(Math.max(now.getTime(), event.startedAt.getTime()))).getTime();
    if (end <= start) continue;

    for (let index = 0; index < 24; index += 1) {
      const bucketStart = dayStart.getTime() + index * 3_600_000;
      const bucketEnd = bucketStart + 3_600_000;
      const overlap = Math.min(end, bucketEnd) - Math.max(start, bucketStart);
      if (overlap > 0) hours[index] += overlap / 60_000;
    }
  }

  return hours.map((minutes) => Math.round(minutes));
}

/** Durée d'un événement, un événement ouvert courant jusqu'à maintenant. */
export function eventDurationMinutes(
  event: { startedAt: Date; endedAt: Date | null },
  now: Date,
): number {
  const end = event.endedAt ?? new Date(Math.max(now.getTime(), event.startedAt.getTime()));
  return Math.max(Math.round((end.getTime() - event.startedAt.getTime()) / 60_000), 0);
}

/** Texte du bandeau de défaut : la raison réelle, jamais un texte générique. */
function faultMessageFor(status: string, reason: string | null): string | null {
  if (status === 'fault') return reason ?? 'Défaut machine détecté';
  if (status === 'stopped') return reason ?? 'Presse à l’arrêt';
  return null;
}

/**
 * État process affiché en pied de carte. Une presse qui produit avec un niveau
 * d'huile bas n'est pas « OK » : le pied de carte le dit, en orange, sans pour
 * autant faire passer la machine en défaut.
 */
function processStateFor(
  status: string,
  signals: MachineSignals | undefined,
): { label: string; severity: Severity } {
  if (status === 'fault') return { label: 'Défaut', severity: 'critical' };
  if (status === 'stopped') return { label: 'Arrêt machine', severity: 'critical' };
  if (status === 'maintenance') return { label: 'Maintenance', severity: 'warning' };
  if (status === 'setup' || status === 'mold_change') return { label: 'Réglage', severity: 'warning' };
  if (status === 'idle') return { label: 'Disponible', severity: 'info' };
  if (signals && !signals.oilLevelOk) return { label: 'Huile basse', severity: 'warning' };
  return { label: 'OK', severity: 'normal' };
}

export async function getMachineFleet(): Promise<MachineFleet> {
  const db = await getDb();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const gatewayHorizon = new Date(now.getTime() - 5 * 60_000);

  const rows = await db
    .select({ machine: t.machines, workshopId: t.workshops.id, workshopName: t.workshops.name })
    .from(t.machines)
    .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
    .orderBy(t.machines.code);

  const machineIds = rows.map((row) => row.machine.id);
  if (machineIds.length === 0) {
    const provider = getProcessSignalsProvider();
    return {
      capturedAt: now,
      machines: [],
      connectedCount: 0,
      totalCount: 0,
      gatewayCount: 0,
      simulatedCount: 0,
      signalsProviderLabel: provider.label,
      signalsMeasured: provider.measured,
    };
  }

  const [events, orders, telemetry, signals, gatewayRows] = await Promise.all([
    db
      .select({
        machineId: t.machineEvents.machineId,
        status: t.machineEvents.status,
        startedAt: t.machineEvents.startedAt,
        endedAt: t.machineEvents.endedAt,
        reason: t.machineEvents.reason,
      })
      .from(t.machineEvents)
      .where(
        and(
          inArray(t.machineEvents.machineId, machineIds),
          gte(t.machineEvents.startedAt, dayStart),
        ),
      )
      .orderBy(t.machineEvents.startedAt),
    db
      .select({
        machineId: t.productionOrders.machineId,
        number: t.productionOrders.number,
        status: t.productionOrders.status,
        producedUnits: t.productionOrders.producedUnits,
        rejectedUnits: t.productionOrders.rejectedUnits,
        plannedStartAt: t.productionOrders.plannedStartAt,
        productName: t.products.name,
        cycleTimeSeconds: t.products.cycleTimeSeconds,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .where(
        and(
          inArray(t.productionOrders.machineId, machineIds),
          gte(t.productionOrders.plannedStartAt, dayStart),
        ),
      ),
    getTelemetryProvider().readMany(machineIds),
    getProcessSignalsProvider().readMany(machineIds, 1),
    db
      .selectDistinct({ machineId: t.machineTelemetry.machineId })
      .from(t.machineTelemetry)
      .where(
        and(
          inArray(t.machineTelemetry.machineId, machineIds),
          eq(t.machineTelemetry.source, 'gateway'),
          gte(t.machineTelemetry.recordedAt, gatewayHorizon),
        ),
      ),
  ]);

  const gatewayIds = new Set(gatewayRows.map((row) => row.machineId));

  const machines: MachineCardModel[] = rows.map(({ machine, workshopId, workshopName }) => {
    const machineEvents = events.filter((event) => event.machineId === machine.id);
    const machineOrders = orders.filter((order) => order.machineId === machine.id);
    const current =
      machineOrders.find((order) => order.status === 'running') ??
      machineOrders.find((order) => order.status === 'paused') ??
      null;

    const producedUnits = machineOrders.reduce((total, order) => total + order.producedUnits, 0);
    const rejectedUnits = machineOrders.reduce((total, order) => total + order.rejectedUnits, 0);

    const hourlyMinutes = productiveMinutesByHour(machineEvents, dayStart, now);
    const plannedMinutes = machineEvents.reduce(
      (total, event) => total + eventDurationMinutes(event, now),
      0,
    );
    const downtimeMinutes = machineEvents
      .filter((event) => event.status === 'stopped' || event.status === 'fault')
      .reduce((total, event) => total + eventDurationMinutes(event, now), 0);

    const oee = computeOee({
      plannedMinutes,
      downtimeMinutes,
      goodUnits: producedUnits,
      rejectedUnits,
      idealCycleTimeSeconds: current?.cycleTimeSeconds ?? 60,
    });

    const machineSignals = signals.get(machine.id);
    const reading = telemetry.find((row) => row.machineId === machine.id);
    const lastEvent = [...machineEvents].reverse().find((event) => event.status === machine.status);

    const processState = processStateFor(machine.status, machineSignals);

    const link: MachineLinkKind = !machine.isActive
      ? 'offline'
      : gatewayIds.has(machine.id)
        ? 'gateway'
        : 'simulated';

    return {
      id: machine.id,
      code: machine.code,
      name: machine.name,
      manufacturer: machine.manufacturer,
      model: machine.model,
      tonnage: machine.tonnage,
      workshopId,
      workshopName,
      imageKey: machineImageKey(machine.manufacturer, machine.model),
      photoUrl: machinePhotoUrl(machine.photoId),
      status: machine.status,
      statusLabel: MACHINE_STATUS_LABELS[machine.status] ?? machine.status,
      severity: machineSeverity(machine.status) as Severity,
      statusSince: machine.statusSince,
      stateLabel: processState.label,
      stateSeverity: processState.severity,
      oeePct: oee.oeePct,
      cycleTimeSeconds: reading?.cycleTimeSeconds ?? null,
      producedUnits,
      rejectedUnits,
      moldTemperatureC: machineSignals?.moldTemperatureC ?? 0,
      energyKwh: machineSignals?.consumption.electricityKwh ?? 0,
      activitySeries: productiveShareSeries(hourlyMinutes),
      faultMessage: faultMessageFor(machine.status, lastEvent?.reason ?? null),
      currentOrderNumber: current?.number ?? null,
      currentProductName: current?.productName ?? null,
      link,
      isActive: machine.isActive,
    };
  });

  const provider = getProcessSignalsProvider();
  const gatewayCount = machines.filter((machine) => machine.link === 'gateway').length;
  const simulatedCount = machines.filter((machine) => machine.link === 'simulated').length;

  return {
    capturedAt: now,
    machines,
    connectedCount: gatewayCount + simulatedCount,
    totalCount: machines.length,
    gatewayCount,
    simulatedCount,
    signalsProviderLabel: provider.label,
    signalsMeasured: provider.measured,
  };
}

/** Identité minimale d'une machine — pour les en-têtes et fils d'Ariane. */
export async function getMachineIdentity(machineId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      id: t.machines.id,
      code: t.machines.code,
      name: t.machines.name,
      manufacturer: t.machines.manufacturer,
      model: t.machines.model,
      status: t.machines.status,
      isActive: t.machines.isActive,
      workshopName: t.workshops.name,
    })
    .from(t.machines)
    .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
    .where(eq(t.machines.id, machineId))
    .limit(1);

  if (!row) return null;

  return {
    ...row,
    statusLabel: MACHINE_STATUS_LABELS[row.status] ?? row.status,
    severity: machineSeverity(row.status) as Severity,
    imageKey: machineImageKey(row.manufacturer, row.model),
  };
}

/** Dernier relevé de passerelle connu, pour l'onglet « Connexions ». */
export async function getGatewayReadings(machineIds: readonly string[]) {
  if (machineIds.length === 0) return new Map<string, Date>();
  const db = await getDb();

  const rows = await db
    .select({ machineId: t.machineTelemetry.machineId, recordedAt: t.machineTelemetry.recordedAt })
    .from(t.machineTelemetry)
    .where(
      and(
        inArray(t.machineTelemetry.machineId, [...machineIds]),
        eq(t.machineTelemetry.source, 'gateway'),
      ),
    )
    .orderBy(desc(t.machineTelemetry.recordedAt))
    .limit(200);

  const latest = new Map<string, Date>();
  for (const row of rows) if (!latest.has(row.machineId)) latest.set(row.machineId, row.recordedAt);
  return latest;
}
