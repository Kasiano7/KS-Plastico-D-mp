export type IncidentForPareto = {
  rootCause: string | null;
  title: string;
  downtimeMinutes: number;
  estimatedCostCents: number;
};

export type ParetoCause = {
  cause: string;
  incidents: number;
  downtimeMinutes: number;
  estimatedCostCents: number;
  sharePct: number;
  cumulativePct: number;
};

/** Regroupe les pannes par cause et calcule la courbe cumulée du Pareto. */
export function computeFailurePareto(incidents: readonly IncidentForPareto[]): ParetoCause[] {
  const groups = new Map<string, Omit<ParetoCause, 'sharePct' | 'cumulativePct'>>();

  for (const incident of incidents) {
    const cause = incident.rootCause?.trim() || 'Cause non renseignée';
    const key = cause.toLocaleLowerCase('fr-FR');
    const current = groups.get(key) ?? {
      cause,
      incidents: 0,
      downtimeMinutes: 0,
      estimatedCostCents: 0,
    };
    current.incidents += 1;
    current.downtimeMinutes += Math.max(incident.downtimeMinutes, 0);
    current.estimatedCostCents += Math.max(incident.estimatedCostCents, 0);
    groups.set(key, current);
  }

  const ranked = [...groups.values()].sort(
    (a, b) => b.downtimeMinutes - a.downtimeMinutes || b.incidents - a.incidents,
  );
  const totalDowntime = ranked.reduce((total, cause) => total + cause.downtimeMinutes, 0);
  const fallbackTotal = ranked.reduce((total, cause) => total + cause.incidents, 0);
  let cumulative = 0;

  return ranked.map((cause) => {
    const share = totalDowntime > 0
      ? (cause.downtimeMinutes / totalDowntime) * 100
      : fallbackTotal > 0
        ? (cause.incidents / fallbackTotal) * 100
        : 0;
    cumulative += share;
    return {
      ...cause,
      sharePct: share,
      cumulativePct: Math.min(cumulative, 100),
    };
  });
}

export function shiftAt(date: Date): 'morning' | 'afternoon' | 'night' {
  const hourPart = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).find((part) => part.type === 'hour');
  const hour = Number(hourPart?.value ?? -1);
  if (hour >= 5 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 21) return 'afternoon';
  return 'night';
}

/** Convertit une saisie `datetime-local` de l'usine en instant UTC. */
export function parisLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const wantedUtc = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(wantedUtc);

  // Deux passages couvrent aussi le changement d'heure été/hiver.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(result);
    const read = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const displayedUtc = Date.UTC(
      Number(read.year),
      Number(read.month) - 1,
      Number(read.day),
      Number(read.hour),
      Number(read.minute),
    );
    result = new Date(result.getTime() + wantedUtc - displayedUtc);
  }

  return Number.isNaN(result.getTime()) ? null : result;
}
