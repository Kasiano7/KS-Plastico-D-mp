/**
 * Journal d'alertes et d'incidents d'une machine (§30).
 *
 * Module **pur** : filtrage, tri, agrégation, corrélation, export. Aucune I/O,
 * aucun JSX — l'écran d'historique se contente d'afficher ce que ce fichier
 * renvoie.
 *
 * Vocabulaire :
 *   - `type`     : nature de la trace (alarme automate, incident, information) ;
 *   - `severity` : gravité perçue par l'exploitation ;
 *   - `impact`   : conséquence sur la production, seule mesure qui compte pour
 *                  le calcul du temps perdu.
 */

export type MachineEventType = 'alarm' | 'incident' | 'information';
export type MachineEventSeverity = 'critical' | 'major' | 'minor' | 'info';
export type MachineEventImpact = 'machine_stop' | 'slowdown' | 'none';
export type MachineEventStatus = 'open' | 'acknowledged' | 'resolved';

/** Conséquence chiffrée d'un événement — base des coûts d'arrêt. */
export type ProductionImpact = {
  downtimeSeconds: number;
  lostParts: number;
  rejectedParts: number;
};

export type MachineEventRecord = {
  id: string;
  machineId: string;
  occurredAt: Date;
  type: MachineEventType;
  severity: MachineEventSeverity;
  /** Code automate (« E-1024 ») ou code d'information (« I-2001 »). */
  code: string;
  title: string;
  description: string;
  durationSeconds: number | null;
  endedAt: Date | null;
  impact: MachineEventImpact;
  operator: string | null;
  shift: string | null;
  status: MachineEventStatus;
  /** Référence produite au moment de l'événement, si connue. */
  productReference: string | null;
  /** Relevés machine au moment de l'événement (libellé → valeur). */
  readings: { label: string; value: string }[];
  correctiveAction: string | null;
  maintenanceComment: string | null;
  productionImpact: ProductionImpact | null;
  /**
   * Événement racine dont celui-ci découle. Permet de ne pas compter cinq
   * pannes là où une seule panne a déclenché cinq alarmes.
   */
  parentEventId: string | null;
  /** Provenance : trace applicative réelle ou journal automate simulé. */
  source: 'application' | 'simulated';
};

export const EVENT_TYPE_LABELS: Record<MachineEventType, string> = {
  alarm: 'Alarme',
  incident: 'Incident',
  information: 'Information',
};

export const EVENT_SEVERITY_LABELS: Record<MachineEventSeverity, string> = {
  critical: 'Critique',
  major: 'Majeure',
  minor: 'Mineure',
  info: 'Information',
};

export const EVENT_IMPACT_LABELS: Record<MachineEventImpact, string> = {
  machine_stop: 'Arrêt machine',
  slowdown: 'Ralentissement',
  none: 'Aucun',
};

export const EVENT_STATUS_LABELS: Record<MachineEventStatus, string> = {
  open: 'Ouvert',
  acknowledged: 'Acquitté',
  resolved: 'Résolu',
};

/** Une sévérité d'événement se traduit en sévérité d'affichage du design system. */
export function eventSeverityTone(
  severity: MachineEventSeverity,
): 'normal' | 'info' | 'warning' | 'critical' {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'major':
      return 'warning';
    case 'minor':
      return 'info';
    default:
      return 'normal';
  }
}

/* ───────────────────────────────────────────────────────────── Filtres ─── */

export type MachineEventFilters = {
  search?: string;
  type?: MachineEventType | 'all';
  severity?: MachineEventSeverity | 'all';
  from?: Date | null;
  to?: Date | null;
};

function matchesSearch(event: MachineEventRecord, needle: string): boolean {
  const haystack = [event.code, event.title, event.description, event.operator ?? '']
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/** Applique les filtres de l'écran d'historique, dans l'ordre le moins coûteux. */
export function filterMachineEvents(
  events: readonly MachineEventRecord[],
  filters: MachineEventFilters,
): MachineEventRecord[] {
  const needle = filters.search?.trim().toLowerCase() ?? '';

  return events.filter((event) => {
    if (filters.type && filters.type !== 'all' && event.type !== filters.type) return false;
    if (filters.severity && filters.severity !== 'all' && event.severity !== filters.severity) {
      return false;
    }
    if (filters.from && event.occurredAt < filters.from) return false;
    if (filters.to && event.occurredAt > filters.to) return false;
    if (needle && !matchesSearch(event, needle)) return false;
    return true;
  });
}

/** Du plus récent au plus ancien — ordre imposé par l'écran. */
export function sortByRecency(events: readonly MachineEventRecord[]): MachineEventRecord[] {
  return [...events].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}

export type Page<T> = {
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  /** Rang du premier élément affiché, en base 1 (0 si la page est vide). */
  firstIndex: number;
  lastIndex: number;
};

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(pageSize, 1);
  const pageCount = Math.max(Math.ceil(items.length / size), 1);
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);

  return {
    items: slice,
    page: current,
    pageCount,
    pageSize: size,
    total: items.length,
    firstIndex: slice.length > 0 ? start + 1 : 0,
    lastIndex: start + slice.length,
  };
}

/**
 * Numéros de pages à afficher, avec ellipses : 1 … 4 5 6 … 13.
 * `null` représente une ellipse.
 */
export function paginationRange(page: number, pageCount: number, span = 1): (number | null)[] {
  if (pageCount <= 1) return [1];

  const pages = new Set<number>([1, pageCount, page]);
  for (let offset = 1; offset <= span; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < pageCount) pages.add(page + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const range: (number | null)[] = [];
  let previous = 0;

  for (const value of sorted) {
    if (previous && value - previous > 1) range.push(null);
    range.push(value);
    previous = value;
  }

  return range;
}

/* ────────────────────────────────────────────────────────── Agrégations ── */

export type SeverityBreakdown = {
  severity: MachineEventSeverity;
  label: string;
  count: number;
  sharePct: number;
};

export function summarizeBySeverity(events: readonly MachineEventRecord[]): SeverityBreakdown[] {
  const order: MachineEventSeverity[] = ['critical', 'major', 'minor', 'info'];
  const total = events.length;

  return order.map((severity) => {
    const count = events.filter((event) => event.severity === severity).length;
    return {
      severity,
      label: EVENT_SEVERITY_LABELS[severity],
      count,
      sharePct: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

/**
 * Temps d'arrêt cumulé, en secondes.
 * Seules les alarmes racines comptent : une alarme rattachée à un incident
 * principal décrit la même panne, la compter deux fois gonflerait le total.
 */
export function totalDowntimeSeconds(events: readonly MachineEventRecord[]): number {
  return events
    .filter((event) => event.parentEventId === null && event.impact === 'machine_stop')
    .reduce((total, event) => total + (event.productionImpact?.downtimeSeconds ?? event.durationSeconds ?? 0), 0);
}

export type AlarmCount = { code: string; title: string; count: number };

/** Les alarmes les plus fréquentes, du plus au moins fréquent. */
export function topAlarms(events: readonly MachineEventRecord[], limit = 5): AlarmCount[] {
  const counts = new Map<string, AlarmCount>();

  for (const event of events) {
    if (event.type === 'information') continue;
    const existing = counts.get(event.code);
    if (existing) existing.count += 1;
    else counts.set(event.code, { code: event.code, title: event.title, count: 1 });
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export type CorrelatedEvent = {
  root: MachineEventRecord;
  related: MachineEventRecord[];
};

/**
 * Regroupe les événements provoqués par une même panne (§corrélation).
 * Un événement orphelin — dont le parent n'est pas dans la fenêtre — est traité
 * comme sa propre racine, pour ne jamais le faire disparaître de l'écran.
 */
export function groupCorrelatedEvents(
  events: readonly MachineEventRecord[],
): CorrelatedEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const groups = new Map<string, CorrelatedEvent>();

  for (const event of sortByRecency(events)) {
    const rootId = event.parentEventId && byId.has(event.parentEventId) ? event.parentEventId : event.id;
    const root = byId.get(rootId) ?? event;
    const group = groups.get(rootId);

    if (!group) groups.set(rootId, { root, related: rootId === event.id ? [] : [event] });
    else if (rootId !== event.id) group.related.push(event);
  }

  return [...groups.values()];
}

/** Événements rattachés à une racine donnée. */
export function relatedEvents(
  events: readonly MachineEventRecord[],
  eventId: string,
): MachineEventRecord[] {
  return sortByRecency(events.filter((event) => event.parentEventId === eventId));
}

/* ───────────────────────────────────────────────────────────── Export ──── */

const CSV_HEADERS = [
  'Date et heure',
  'Type',
  'Sévérité',
  'Code',
  'Événement',
  'Description',
  'Durée (s)',
  'Impact',
  'Opérateur',
  'Statut',
  'Temps perdu (s)',
  'Pièces perdues',
  'Pièces rebutées',
  'Source',
] as const;

/**
 * Distingue un fait applicatif réel d'une entrée générée par le journal
 * d'alarmes simulé (§31) : un export qui les mélangerait sans le dire
 * pourrait être pris pour une trace 100 % réelle par qui le reçoit.
 */
const EVENT_SOURCE_LABELS: Record<MachineEventRecord['source'], string> = {
  application: 'Trace applicative',
  simulated: 'Journal automate simulé',
};

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Export CSV — séparateur point-virgule et BOM UTF-8 : c'est ce qu'attend
 * Excel en configuration française, et l'export sert d'abord à ça.
 */
export function eventsToCsv(
  events: readonly MachineEventRecord[],
  formatDateTime: (date: Date) => string,
): string {
  const rows = sortByRecency(events).map((event) =>
    [
      formatDateTime(event.occurredAt),
      EVENT_TYPE_LABELS[event.type],
      EVENT_SEVERITY_LABELS[event.severity],
      event.code,
      event.title,
      event.description,
      event.durationSeconds,
      EVENT_IMPACT_LABELS[event.impact],
      event.operator,
      EVENT_STATUS_LABELS[event.status],
      event.productionImpact?.downtimeSeconds ?? null,
      event.productionImpact?.lostParts ?? null,
      event.productionImpact?.rejectedParts ?? null,
      EVENT_SOURCE_LABELS[event.source],
    ]
      .map(csvCell)
      .join(';'),
  );

  return `﻿${[CSV_HEADERS.join(';'), ...rows].join('\r\n')}\r\n`;
}

/* ────────────────────────────────────────────────────────────── Durées ── */

/** 138 → « 02m 18s », 4 210 → « 01h 10m 10s ». */
export function formatEventDuration(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '-';

  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');

  if (hours > 0) return `${pad(hours)}h ${pad(minutes)}m ${pad(rest)}s`;
  return `${pad(minutes)}m ${pad(rest)}s`;
}
