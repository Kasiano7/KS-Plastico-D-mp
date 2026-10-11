/**
 * Vocabulaire de sévérité partagé par tout le design system.
 * Une seule table de correspondance : impossible d'avoir deux oranges différents.
 */

export type Severity = 'normal' | 'info' | 'warning' | 'critical';

export const SEVERITY_LABELS: Record<Severity, string> = {
  normal: 'Normal',
  info: 'Information',
  warning: 'Attention',
  critical: 'Critique',
};

/** Le symbole double la couleur : l'information ne dépend jamais de la teinte seule (§47). */
export const SEVERITY_SYMBOLS: Record<Severity, string> = {
  normal: '●',
  info: '◆',
  warning: '▲',
  critical: '■',
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  normal: 'text-normal',
  info: 'text-info',
  warning: 'text-warning',
  critical: 'text-critical',
};

export const SEVERITY_BG: Record<Severity, string> = {
  normal: 'bg-normal',
  info: 'bg-info',
  warning: 'bg-warning',
  critical: 'bg-critical',
};

export const SEVERITY_SOFT_BG: Record<Severity, string> = {
  normal: 'bg-normal-soft',
  info: 'bg-info-soft',
  warning: 'bg-warning-soft',
  critical: 'bg-critical-soft',
};

export const SEVERITY_CHIP: Record<Severity, string> = {
  normal: 'bg-normal-soft text-normal border-normal/25',
  info: 'bg-info-soft text-info border-info/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  critical: 'bg-critical-soft text-critical border-critical/30',
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  normal: 3,
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}
