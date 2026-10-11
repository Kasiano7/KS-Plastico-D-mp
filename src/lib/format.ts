/**
 * Formatage — français, fuseau Europe/Paris.
 *
 * Le fuseau est explicite afin que le rendu serveur et le rendu client
 * produisent exactement la même chaîne (pas d'erreur d'hydratation).
 */

const TIME_ZONE = 'Europe/Paris';

const numberFormat = new Intl.NumberFormat('fr-FR');
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const moneyFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const moneyPreciseFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIME_ZONE,
});
const dateLongFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
});

export function formatNumber(value: number): string {
  return numberFormat.format(Math.round(value));
}

export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** Montant stocké en centimes → « 3 850 € ». */
export function formatCents(cents: number): string {
  return moneyFormat.format(cents / 100);
}

/** Montant stocké en centimes → « 412 k€ », pour les synthèses de direction. */
export function formatCompactCents(cents: number): string {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) {
    return `${numberFormat.format(Math.round(euros / 1000))} k€`;
  }
  return moneyFormat.format(euros);
}

/** Montant stocké en centimes → « 38,50 € », pour les coûts unitaires. */
export function formatCentsPrecise(cents: number): string {
  return moneyPreciseFormat.format(cents / 100);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${decimals > 0 ? decimalFormat.format(value) : numberFormat.format(Math.round(value))} %`;
}

export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

export function formatDateLong(value: Date | string): string {
  return dateLongFormat.format(new Date(value));
}

export function formatTime(value: Date | string): string {
  return timeFormat.format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
  return dateTimeFormat.format(new Date(value));
}

/** 72 → « 1 h 12 ». */
export function formatDuration(minutes: number): string {
  const total = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${String(rest).padStart(2, '0')}`;
}

/** Taille de fichier — en unités binaires, comme l'explorateur du poste. */
export function formatFileSize(bytes: number): string {
  const size = Math.max(bytes, 0);
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Écart en jours, exprimé du point de vue de l'utilisateur. */
export function formatDueDelta(due: Date | string, reference: Date = new Date()): string {
  const dueDate = new Date(due);
  const days = Math.round((dueDate.getTime() - reference.getTime()) / 86_400_000);
  if (days < -1) return `en retard de ${Math.abs(days)} jours`;
  if (days === -1) return 'en retard d’un jour';
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  return `dans ${days} jours`;
}

/** « il y a 1 h 12 » — utilisé sur les alertes et les événements machine. */
export function formatSince(value: Date | string, reference: Date = new Date()): string {
  const minutes = Math.max(Math.round((reference.getTime() - new Date(value).getTime()) / 60_000), 0);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const days = Math.floor(minutes / 1440);
  if (days >= 1) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  return `il y a ${formatDuration(minutes)}`;
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
