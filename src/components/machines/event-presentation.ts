import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { MachineEventSeverity, MachineEventType } from '@/server/domain/machine-events';

/**
 * Habillage des événements machine, partagé par le tableau et le tiroir.
 *
 * Le vert reste réservé à « tout va bien » : une information n'est ni bonne
 * ni mauvaise, elle est neutre. Elle ne prend donc pas la teinte `normal` du
 * design system mais un gris de texte secondaire.
 */
export const EVENT_TYPE_ICON: Record<MachineEventType, LucideIcon> = {
  alarm: CircleAlert,
  incident: TriangleAlert,
  information: Info,
};

export const EVENT_TYPE_TEXT: Record<MachineEventType, string> = {
  alarm: 'text-critical',
  incident: 'text-warning',
  information: 'text-info',
};

/**
 * Pastilles de sévérité en contour, comme sur la maquette : dans un tableau
 * dense, dix aplats colorés se disputeraient l'attention.
 */
export const EVENT_SEVERITY_CHIP: Record<MachineEventSeverity, string> = {
  critical: 'border-critical/55 bg-transparent text-critical',
  major: 'border-warning/55 bg-transparent text-warning',
  minor: 'border-info/55 bg-transparent text-info',
  info: 'border-line-strong bg-transparent text-fg-muted',
};

export const EVENT_SEVERITY_DOT: Record<MachineEventSeverity, string> = {
  critical: 'text-critical',
  major: 'text-warning',
  minor: 'text-info',
  info: 'text-fg-subtle',
};
