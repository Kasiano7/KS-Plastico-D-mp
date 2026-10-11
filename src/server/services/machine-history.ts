import 'server-only';

import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  filterMachineEvents,
  paginate,
  relatedEvents,
  sortByRecency,
  summarizeBySeverity,
  topAlarms,
  totalDowntimeSeconds,
  type MachineEventFilters,
  type MachineEventRecord,
  type MachineEventSeverity,
  type Page,
  type SeverityBreakdown,
} from '../domain/machine-events';
import { getAlarmLogProvider, shiftLabelAt } from '../telemetry/alarm-log';

/**
 * Historique des alertes et incidents d'une machine (§30).
 *
 * Trois sources fusionnent ici, et l'écran les distingue toujours :
 *
 *  1. `machine_events` — les états réels de la presse enregistrés par
 *     l'application (arrêts, réglages, remises en service) ;
 *  2. `incidents` — la mémoire métier de l'usine, saisie par les équipes ;
 *  3. le journal automate — fourni par la passerelle, **simulé** en V1.
 *
 * Le service ne décide de rien : il assemble, laisse le domaine filtrer,
 * agréger et corréler, puis renvoie un objet prêt à afficher.
 */

export const DEFAULT_HISTORY_DAYS = 4;

export type MachineHistoryQuery = {
  search?: string;
  type?: string;
  severity?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type MachineHistory = {
  machineId: string;
  /** Bornes réellement appliquées, renvoyées aux champs de date. */
  from: Date;
  to: Date;
  previousFrom: Date;
  /** Tous les événements de la période, avant filtres d'écran. */
  periodEvents: MachineEventRecord[];
  /** Événements après filtres, triés du plus récent au plus ancien. */
  filtered: MachineEventRecord[];
  page: Page<MachineEventRecord>;
  breakdown: SeverityBreakdown[];
  downtimeSeconds: number;
  previousDowntimeSeconds: number;
  downtimeVariationPct: number | null;
  /** Temps d'arrêt quotidien sur la période étendue, pour le mini graphique. */
  downtimeTrend: { date: Date; seconds: number }[];
  topAlarms: ReturnType<typeof topAlarms>;
  sourceLabel: string;
  measured: boolean;
};

function parseDate(value: string | undefined, fallback: Date, endOfDay = false): Date {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Gravité métier d'un incident → gravité d'événement machine. */
function incidentSeverity(severity: string): MachineEventSeverity {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'major';
  if (severity === 'info') return 'minor';
  return 'info';
}

/** Un état machine devient une trace lisible dans l'historique. */
const STATUS_EVENT: Record<
  string,
  { code: string; title: string; severity: MachineEventSeverity; impact: 'machine_stop' | 'slowdown' | 'none' }
> = {
  fault: { code: 'A-0001', title: 'Défaut machine', severity: 'critical', impact: 'machine_stop' },
  stopped: { code: 'A-0002', title: 'Arrêt de production', severity: 'critical', impact: 'machine_stop' },
  maintenance: { code: 'A-0010', title: 'Intervention de maintenance', severity: 'major', impact: 'machine_stop' },
  setup: { code: 'A-0020', title: 'Réglage presse', severity: 'minor', impact: 'machine_stop' },
  mold_change: { code: 'A-0021', title: 'Changement de moule', severity: 'minor', impact: 'machine_stop' },
  production: { code: 'A-0100', title: 'Démarrage de production', severity: 'info', impact: 'none' },
  idle: { code: 'A-0101', title: 'Presse disponible', severity: 'info', impact: 'none' },
};

export async function getMachineHistory(
  machineId: string,
  query: MachineHistoryQuery = {},
): Promise<MachineHistory | null> {
  const db = await getDb();
  const now = new Date();

  const [machine] = await db
    .select({ id: t.machines.id, code: t.machines.code })
    .from(t.machines)
    .where(eq(t.machines.id, machineId))
    .limit(1);

  if (!machine) return null;

  const defaultFrom = startOfDay(new Date(now.getTime() - (DEFAULT_HISTORY_DAYS - 1) * 86_400_000));
  const from = parseDate(query.from, defaultFrom);
  const to = parseDate(query.to, now, true);
  const spanMs = Math.max(to.getTime() - from.getTime(), 86_400_000);
  const previousFrom = new Date(from.getTime() - spanMs);

  const [eventRows, incidentRows, shiftEmployees] = await Promise.all([
    db
      .select()
      .from(t.machineEvents)
      .where(
        and(
          eq(t.machineEvents.machineId, machineId),
          gte(t.machineEvents.startedAt, previousFrom),
          lte(t.machineEvents.startedAt, to),
        ),
      )
      .orderBy(desc(t.machineEvents.startedAt)),
    db
      .select()
      .from(t.incidents)
      .where(
        and(
          eq(t.incidents.machineId, machineId),
          gte(t.incidents.occurredAt, previousFrom),
          lte(t.incidents.occurredAt, to),
        ),
      )
      .orderBy(desc(t.incidents.occurredAt)),
    db
      .select({
        firstName: t.employees.firstName,
        lastName: t.employees.lastName,
        shift: t.employees.shift,
        jobTitle: t.employees.jobTitle,
      })
      .from(t.employees)
      .where(eq(t.employees.isActive, true)),
  ]);

  // Un opérateur réel par équipe : l'historique nomme quelqu'un qui existe,
  // ou l'équipe elle-même si aucun opérateur n'est rattaché.
  const operatorByShift = new Map<string, string>();
  for (const employee of shiftEmployees) {
    const label =
      employee.shift === 'morning'
        ? 'Équipe A (Matin)'
        : employee.shift === 'afternoon'
          ? 'Équipe B (Soir)'
          : 'Nuit';
    if (!operatorByShift.has(label) && /op[ée]rateur|r[ée]gleur|chef/i.test(employee.jobTitle)) {
      operatorByShift.set(label, `${employee.firstName} ${employee.lastName}`);
    }
  }

  const applicationEvents: MachineEventRecord[] = [
    ...eventRows.map((event): MachineEventRecord => {
      const mapped = STATUS_EVENT[event.status] ?? STATUS_EVENT.idle;
      const end = event.endedAt;
      const durationSeconds = end
        ? Math.max(Math.round((end.getTime() - event.startedAt.getTime()) / 1_000), 0)
        : null;
      const shift = shiftLabelAt(event.startedAt);

      return {
        id: `event:${event.id}`,
        machineId,
        occurredAt: event.startedAt,
        type: mapped.impact === 'none' ? 'information' : 'incident',
        severity: mapped.severity,
        code: mapped.code,
        title: mapped.title,
        description: event.reason ?? 'État enregistré par l’application',
        durationSeconds,
        endedAt: end,
        impact: mapped.impact,
        operator: operatorByShift.get(shift) ?? null,
        shift,
        status: end ? 'resolved' : 'open',
        productReference: null,
        readings: [],
        correctiveAction: null,
        maintenanceComment: null,
        productionImpact:
          mapped.impact === 'machine_stop' && durationSeconds
            ? { downtimeSeconds: durationSeconds, lostParts: 0, rejectedParts: 0 }
            : null,
        parentEventId: null,
        source: 'application',
      };
    }),
    ...incidentRows.map((incident): MachineEventRecord => {
      const shift = shiftLabelAt(incident.occurredAt);
      return {
        id: `incident:${incident.id}`,
        machineId,
        occurredAt: incident.occurredAt,
        type: 'incident',
        severity: incidentSeverity(incident.severity),
        code: incident.reference,
        title: incident.title,
        description: incident.symptom,
        durationSeconds: incident.downtimeMinutes > 0 ? incident.downtimeMinutes * 60 : null,
        endedAt: incident.resolvedAt,
        impact: incident.downtimeMinutes > 0 ? 'machine_stop' : 'slowdown',
        operator: operatorByShift.get(shift) ?? null,
        shift,
        status:
          incident.status === 'resolved' || incident.status === 'closed'
            ? 'resolved'
            : incident.status === 'investigating'
              ? 'acknowledged'
              : 'open',
        productReference: null,
        readings: [],
        correctiveAction: incident.resolution,
        maintenanceComment: incident.rootCause,
        productionImpact:
          incident.downtimeMinutes > 0
            ? { downtimeSeconds: incident.downtimeMinutes * 60, lostParts: 0, rejectedParts: 0 }
            : null,
        parentEventId: null,
        source: 'application',
      };
    }),
  ];

  const alarmLog = getAlarmLogProvider();
  const generated = await alarmLog.read({ machineId, seed: machine.code, from: previousFrom, to });

  const all = sortByRecency([
    ...applicationEvents,
    ...generated.map((event) => ({
      ...event,
      operator: event.shift ? (operatorByShift.get(event.shift) ?? null) : null,
    })),
  ]);

  const periodEvents = all.filter((event) => event.occurredAt >= from && event.occurredAt <= to);
  const previousEvents = all.filter(
    (event) => event.occurredAt >= previousFrom && event.occurredAt < from,
  );

  const filters: MachineEventFilters = {
    search: query.search,
    type: (query.type as MachineEventFilters['type']) ?? 'all',
    severity: (query.severity as MachineEventFilters['severity']) ?? 'all',
  };
  const filtered = sortByRecency(filterMachineEvents(periodEvents, filters));

  const downtimeSeconds = totalDowntimeSeconds(periodEvents);
  const previousDowntimeSeconds = totalDowntimeSeconds(previousEvents);

  const trendDays = Math.min(Math.max(Math.round(spanMs / 86_400_000) * 2 + 2, 6), 14);
  const downtimeTrend = Array.from({ length: trendDays }, (_, index) => {
    const dayStart = startOfDay(new Date(to.getTime() - (trendDays - 1 - index) * 86_400_000));
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const dayEvents = all.filter(
      (event) => event.occurredAt >= dayStart && event.occurredAt < dayEnd,
    );
    return { date: dayStart, seconds: totalDowntimeSeconds(dayEvents) };
  });

  return {
    machineId,
    from,
    to,
    previousFrom,
    periodEvents,
    filtered,
    page: paginate(filtered, query.page ?? 1, query.pageSize ?? 10),
    breakdown: summarizeBySeverity(periodEvents),
    downtimeSeconds,
    previousDowntimeSeconds,
    downtimeVariationPct:
      previousDowntimeSeconds > 0
        ? Math.round(((downtimeSeconds - previousDowntimeSeconds) / previousDowntimeSeconds) * 100)
        : null,
    downtimeTrend,
    topAlarms: topAlarms(periodEvents),
    sourceLabel: alarmLog.label,
    measured: alarmLog.measured,
  };
}

/** Détail d'un événement et de ses alarmes filles, pour le tiroir latéral. */
export function findEventWithRelated(history: MachineHistory, eventId: string) {
  const event = history.periodEvents.find((candidate) => candidate.id === eventId);
  if (!event) return null;
  return { event, related: relatedEvents(history.periodEvents, event.id) };
}
