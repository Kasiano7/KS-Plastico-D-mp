import type { Severity, Tone } from '@/types/dashboard';

/**
 * Traduction « teinte fonctionnelle → classes du design system ».
 *
 * Deux raisons d'exister :
 *   1. Tailwind ne peut pas générer une classe construite dynamiquement
 *      (`text-accent-${tone}` n'existe pas au build) ; il faut un registre.
 *   2. Aucun composant n'a ainsi à connaître une couleur : il connaît une
 *      intention. Changer de thème ne touche pas une ligne de TSX.
 *
 * Les graphiques utilisent `currentColor` plutôt qu'une couleur littérale :
 * on pose la classe de texte sur le conteneur, le SVG en hérite, et le thème
 * reste la seule source de vérité.
 */

export const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-accent-blue',
  cyan: 'text-accent-cyan',
  purple: 'text-accent-purple',
  orange: 'text-accent-orange',
  green: 'text-accent-green',
  red: 'text-danger',
  neutral: 'text-ink-muted',
};

/** Pastille d'icône : fond très dilué, la couleur informe sans crier. */
export const TONE_SURFACE: Record<Tone, string> = {
  blue: 'bg-accent-blue/12 text-accent-blue',
  cyan: 'bg-accent-cyan/12 text-accent-cyan',
  purple: 'bg-accent-purple/12 text-accent-purple',
  orange: 'bg-accent-orange/12 text-accent-orange',
  green: 'bg-accent-green/12 text-accent-green',
  red: 'bg-danger/12 text-danger',
  neutral: 'bg-ink-muted/10 text-ink-muted',
};

export const TONE_FILL: Record<Tone, string> = {
  blue: 'bg-accent-blue',
  cyan: 'bg-accent-cyan',
  purple: 'bg-accent-purple',
  orange: 'bg-accent-orange',
  green: 'bg-accent-green',
  red: 'bg-danger',
  neutral: 'bg-ink-muted',
};

/* ── Gravité ──────────────────────────────────────────────────────────────── */

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: 'red',
  warning: 'orange',
  info: 'blue',
  success: 'green',
};

export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  success: 'text-success',
};

export const SEVERITY_FILL: Record<Severity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
  success: 'bg-success',
};

/**
 * Jamais la couleur seule : chaque niveau porte aussi un symbole, lisible par
 * un daltonien comme par un opérateur devant un écran d'atelier.
 */
export const SEVERITY_GLYPH: Record<Severity, string> = {
  critical: '■',
  warning: '▲',
  info: '◆',
  success: '●',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critique',
  warning: 'Vigilance',
  info: 'Information',
  success: 'Normal',
};
