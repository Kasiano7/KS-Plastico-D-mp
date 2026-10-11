import type { Severity } from '@/components/ui/severity';
import type {
  FactoryContext,
  InventorySnapshot,
  MachineSnapshot,
  OrderSnapshot,
} from '../services/factory-context';

/**
 * Moteur de recommandations continu (§ ROADMAP.md Phase 3) — la moitié
 * « détection ». Pur, sans I/O : prend en entrée le même `FactoryContext` que
 * le reste de l'application lit déjà, ne recalcule jamais un chiffre
 * autrement (§ règle 4 de CLAUDE.md — la sévérité machine, le risque
 * commande, la rupture stock viennent tous de calculs déjà faits ailleurs).
 *
 * Volontairement absent de cette liste : la dérive de cadence. Elle
 * demanderait une tendance dans le temps (historique d'OEE), pas seulement
 * un instantané — à construire quand l'historique sera exploité pour ça,
 * plutôt que d'inventer un seuil arbitraire aujourd'hui.
 */

/**
 * Vocabulaire de domaine aligné sur celui déjà utilisé par le seed et
 * `alert-card.tsx` (`DOMAIN_LABELS`) — une alerte « commande » créée par ce
 * moteur doit pouvoir dédoublonner contre une alerte « commande » créée
 * ailleurs. Un domaine maison différent (ex. `orders`) romprait
 * silencieusement cette déduplication : deux alertes distinctes pour le même
 * problème, jamais rapprochées.
 */
export type AlertDomain = 'machine' | 'commande' | 'stock' | 'personnel';

export type DetectedIssue = {
  /** Identifiant stable pour la déduplication — même presse/commande/référence = même alerte, jamais deux fois. */
  signature: string;
  domain: AlertDomain;
  severity: Severity;
  title: string;
  problem: string;
  probableCause: string | null;
  consequences: string;
  impactCents: number;
  impactOrigin: 'computed' | 'estimated';
  machineId?: string;
  workshopId?: string;
  customerOrderId?: string;
  context: Record<string, unknown>;
};

function severityRank(severity: Severity): number {
  return { critical: 3, warning: 2, info: 1, normal: 0 }[severity];
}

export function detectMachineIssues(machines: readonly MachineSnapshot[]): DetectedIssue[] {
  return machines
    .filter((machine) => machine.severity === 'critical')
    .map((machine) => {
      const downtimeHours = machine.downtimeMinutes / 60;
      // Coût machine réel × durée d'arrêt réelle — un chiffre calculé, pas estimé au doigt mouillé.
      const impactCents = Math.round(machine.hourlyCostCents * downtimeHours);
      return {
        signature: `machine:${machine.id}`,
        domain: 'machine' as const,
        severity: 'critical' as const,
        title: `${machine.name} — ${machine.status === 'fault' ? 'défaut' : 'arrêt'}`,
        problem: machine.reason ?? `Presse ${machine.status === 'fault' ? 'en défaut' : 'à l’arrêt'} depuis ${Math.round(downtimeHours * 60)} min.`,
        probableCause: machine.reason,
        consequences: machine.currentOrderNumber
          ? `Ordre ${machine.currentOrderNumber} interrompu (${machine.currentProductName ?? 'pièce non identifiée'}).`
          : 'Aucun ordre actif sur cette machine au moment du constat.',
        impactCents,
        impactOrigin: 'computed' as const,
        machineId: machine.id,
        workshopId: machine.workshopId,
        context: { machineCode: machine.code, downtimeMinutes: machine.downtimeMinutes },
      };
    });
}

export function detectOrderRiskIssues(orders: readonly OrderSnapshot[]): DetectedIssue[] {
  return orders
    .filter((order) => severityRank(order.severity) >= severityRank('warning'))
    .filter((order) => order.status !== 'shipped' && order.status !== 'cancelled')
    .map((order) => ({
      signature: `commande:${order.id}`,
      domain: 'commande' as const,
      severity: order.severity,
      title: `Commande #${order.number} — risque de retard ${order.riskPct} %`,
      problem: order.riskReasons[0] ?? `Risque de retard estimé à ${order.riskPct} %.`,
      probableCause: order.riskReasons.slice(1).join(' ') || null,
      consequences: `${order.customerName} — ${order.remainingUnits.toLocaleString('fr-FR')} pièces restantes sur ${order.quantityUnits.toLocaleString('fr-FR')}, échéance ${order.dueAt.toISOString().slice(0, 10)}.`,
      // Aucune valeur de commande dans cet instantané (pas de prix unitaire ici) —
      // 0/estimated plutôt qu'un calcul approximatif présenté comme sûr.
      impactCents: 0,
      impactOrigin: 'estimated' as const,
      customerOrderId: order.id,
      workshopId: order.workshopIds[0],
      context: { orderNumber: order.number, riskPct: order.riskPct, riskReasons: order.riskReasons },
    }));
}

export function detectInventoryIssues(inventory: readonly InventorySnapshot[]): DetectedIssue[] {
  return inventory
    .filter((item) => severityRank(item.severity) >= severityRank('warning'))
    .map((item) => ({
      signature: `stock:${item.id}`,
      domain: 'stock' as const,
      severity: item.severity,
      title: `${item.name} — rupture projetée`,
      problem:
        item.shortageInDays !== null
          ? `Rupture de stock projetée dans ${item.shortageInDays} jour${item.shortageInDays > 1 ? 's' : ''}.`
          : `Couverture de stock sous le seuil de sécurité (${item.coverageDays} j).`,
      probableCause: `Consommation moyenne ${item.averageDailyConsumption.toLocaleString('fr-FR')} ${item.unit}/j pour ${item.available.toLocaleString('fr-FR')} ${item.unit} disponibles.`,
      consequences: 'Risque de blocage des ordres de fabrication consommant cette référence.',
      impactCents: 0,
      impactOrigin: 'estimated' as const,
      context: { sku: item.sku, kind: item.kind, coverageDays: item.coverageDays, shortageInDays: item.shortageInDays },
    }));
}

export function detectStaffQualificationIssues(
  expiringQualifications: readonly {
    id: string;
    employeeId: string;
    fullName: string;
    label: string;
    daysRemaining: number;
    status: 'expiring' | 'expired';
  }[],
): DetectedIssue[] {
  return expiringQualifications.map((qualification) => ({
    signature: `personnel:${qualification.id}`,
    domain: 'personnel' as const,
    severity: qualification.status === 'expired' ? 'critical' : 'warning',
    title: `${qualification.fullName} — habilitation ${qualification.status === 'expired' ? 'expirée' : 'à échéance'}`,
    problem:
      qualification.status === 'expired'
        ? `« ${qualification.label} » a expiré il y a ${Math.abs(qualification.daysRemaining)} jour${Math.abs(qualification.daysRemaining) > 1 ? 's' : ''}.`
        : `« ${qualification.label} » expire dans ${qualification.daysRemaining} jour${qualification.daysRemaining > 1 ? 's' : ''}.`,
    probableCause: null,
    consequences: 'Affectation aux postes nécessitant cette habilitation à revoir.',
    impactCents: 0,
    impactOrigin: 'estimated' as const,
    context: { employeeId: qualification.employeeId, qualification: qualification.label },
  }));
}

export function detectAllIssues(context: Pick<FactoryContext, 'machines' | 'orders' | 'inventory' | 'staff'>): DetectedIssue[] {
  return [
    ...detectMachineIssues(context.machines),
    ...detectOrderRiskIssues(context.orders),
    ...detectInventoryIssues(context.inventory),
    ...detectStaffQualificationIssues(context.staff.expiringQualifications),
  ];
}
