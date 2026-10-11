import type { Severity } from '@/components/ui/severity';

/**
 * Urgence croissante — distincte de `SEVERITY_ORDER` (§ ui/severity.ts, qui
 * trie du plus grave au moins grave pour l'affichage). Ici on veut
 * l'inverse : « au moins aussi urgent que mon seuil ».
 */
const URGENCY: Record<Severity, number> = { normal: 0, info: 1, warning: 2, critical: 3 };

/** Une notification hors-app ne part que si elle est au moins aussi urgente que le seuil choisi par l'utilisateur. */
export function meetsNotificationThreshold(severity: Severity, minSeverity: Severity): boolean {
  return URGENCY[severity] >= URGENCY[minSeverity];
}
