/**
 * Aides temporelles du jeu de démonstration.
 *
 * Le seed est ancré sur l'heure de génération : l'usine raconte donc toujours
 * « aujourd'hui », quelle que soit la date à laquelle on lance le projet.
 */

export function atTime(base: Date, hours: number, minutes = 0): Date {
  const date = new Date(base);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function addDays(base: Date, days: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

export function addMinutes(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000);
}

export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

/** Jour ouvré suivant (samedi/dimanche exclus). */
export function nextWorkingDay(base: Date, days: number): Date {
  let date = new Date(base);
  let remaining = days;
  while (remaining > 0) {
    date = addDays(date, 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}
