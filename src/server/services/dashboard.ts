import 'server-only';

import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getFactoryContext, type OrderSnapshot } from '@/server/services/factory-context';
import type { Severity as ServerSeverity } from '@/components/ui/severity';
import { formatCompactCents, formatNumber, formatPercent } from '@/lib/format';
import type {
  AiSuggestion,
  AlertsPanelData,
  CostBreakdown,
  CostSlice,
  DashboardData,
  FactoryStat,
  GanttPlanning,
  GanttStatus,
  HeaderInfo,
  KeyKpi,
  KpiCard,
  MachineDowntime,
  ProductionPoint,
  ProductionToday,
  QuickAction,
  RiskOrder,
  Severity,
  WorkshopShare,
} from '@/types/dashboard';

/**
 * Source unique de l'écran d'accueil.
 *
 * Tout ce qui est un chiffre vient de `getFactoryContext()` (le même contexte
 * que la Control Tower et le copilote) ou d'une requête ciblée sur la base :
 * jamais de valeur inventée indépendamment des autres (§40 du cahier des
 * charges). Seuls les libellés de navigation (suggestions IA, accès rapides,
 * vue d'ensemble usine de l'en-tête) restent statiques : ce ne sont pas des
 * mesures.
 */

/* ── En-tête (statique — non affiché par l'écran d'accueil actuel) ───────── */

const header: HeaderInfo = {
  greeting: 'Bonjour,',
  subtitle: 'L’IA de KS Plastico Demo analyse votre usine en temps réel.',
  date: '',
  time: '',
  unreadNotifications: 0,
};

/* ── Barre IA ─────────────────────────────────────────────────────────────── */

export const DASHBOARD_AI_SUGGESTIONS: AiSuggestion[] = [
  { id: 'q1', label: 'Peut-on produire la commande 5842 vendredi ?' },
  { id: 'q2', label: 'Quels sont les retards critiques ?' },
  { id: 'q3', label: 'Analyse des arrêts machines' },
  { id: 'q4', label: 'Stock palettes disponible' },
];

/* ── Accès rapides (navigation — pas des chiffres) ────────────────────────── */

const quickActions: QuickAction[] = [
  { id: 'planning', label: 'Planning de production', href: '/planning', icon: 'planning', tone: 'blue' },
  { id: 'alertes', label: 'Centre d’alertes', href: '/alertes', icon: 'alerts', tone: 'cyan' },
  { id: 'rapport', label: 'Rapport quotidien', href: '/rapports', icon: 'daily-report', tone: 'purple' },
  {
    id: 'commandes',
    label: 'Suivi des commandes',
    href: '/commandes',
    icon: 'order-tracking',
    tone: 'green',
  },
];

/* ── Vue globale de l'usine (non affichée par l'écran d'accueil actuel) ──── */

const factoryStats: FactoryStat[] = [];

const DOMAIN_LABELS: Record<string, string> = {
  machine: 'Machine',
  stock: 'Stock',
  commande: 'Commande',
  production: 'Production',
  personnel: 'Personnel',
  planning: 'Planning',
  qualite: 'Qualité',
};

const WORKSHOP_TONES: WorkshopShare['tone'][] = ['blue', 'cyan', 'orange', 'purple', 'green'];

function toDashboardSeverity(severity: ServerSeverity): Severity {
  return severity === 'normal' ? 'success' : severity;
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

const WEEKDAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

/** Numéro de semaine approximatif (non ISO) — suffisant pour un libellé d'en-tête. */
function weekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDays = (date.getTime() - firstDayOfYear.getTime()) / 86_400_000;
  return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
}

type HealthDimensionKey = 'productionScore' | 'inventoryScore' | 'machineScore' | 'planningScore' | 'qualityScore';

function dimensionSeries(
  history: Record<HealthDimensionKey, number>[],
  key: HealthDimensionKey,
  current: number,
): number[] {
  return [...history.map((row) => row[key]), current];
}

function formatDeltaPoints(deltaPts: number): string {
  if (deltaPts === 0) return '0 pt';
  return `${deltaPts > 0 ? '+' : ''}${deltaPts} pt`;
}

/**
 * Source unique de l'écran d'accueil.
 *
 * Signature volontairement asynchrone : c'est ici, et nulle part ailleurs,
 * que le composant de page va chercher ses données.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const db = await getDb();
  const context = await getFactoryContext();
  const now = context.capturedAt;
  const dayStart = context.dayStart;
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const [snapshotRows, costModelRows, costProductionRows, stopEventRows] = await Promise.all([
    db.select().from(t.healthSnapshots).orderBy(desc(t.healthSnapshots.capturedAt)).limit(30),
    db.select().from(t.costModels).where(eq(t.costModels.isDefault, true)).limit(1),
    db
      .select({
        producedUnits: t.productionOrders.producedUnits,
        weightGrams: t.products.weightGrams,
        cycleTimeSeconds: t.products.cycleTimeSeconds,
        materialCostCentsPerKg: t.materials.costCentsPerKg,
        cavities: t.molds.cavities,
      })
      .from(t.productionOrders)
      .innerJoin(t.products, eq(t.productionOrders.productId, t.products.id))
      .leftJoin(t.materials, eq(t.products.materialId, t.materials.id))
      .leftJoin(t.molds, eq(t.productionOrders.moldId, t.molds.id))
      .where(and(gte(t.productionOrders.plannedStartAt, dayStart), lt(t.productionOrders.plannedStartAt, dayEnd))),
    db
      .select({ machineId: t.machineEvents.machineId, status: t.machineEvents.status })
      .from(t.machineEvents)
      .where(and(gte(t.machineEvents.startedAt, dayStart), eq(t.machineEvents.status, 'stopped'))),
  ]);

  const history = [...snapshotRows].reverse();
  const dimension = (key: string) => context.health.dimensions.find((d) => d.dimension === key)?.score ?? 0;

  /* ── KPI principaux ─────────────────────────────────────────────────── */

  const kpis: KpiCard[] = [
    {
      id: 'production',
      href: '/production',
      label: 'Production',
      value: `${context.production.achievementPct} %`,
      caption: `${formatNumber(context.production.producedUnits)} / ${formatNumber(context.production.targetUnits)} unités`,
      icon: 'production',
      tone: 'purple',
      series: dimensionSeries(history, 'productionScore', dimension('production')),
    },
    {
      id: 'commandes',
      href: '/commandes',
      label: 'Commandes',
      value:
        context.orders.length > 0
          ? `${Math.round(((context.orders.length - context.orders.filter((o) => o.isLate).length) / context.orders.length) * 100)} %`
          : '100 %',
      caption: 'Dans les délais',
      icon: 'orders',
      tone: 'blue',
      series: dimensionSeries(history, 'planningScore', dimension('planning')),
    },
    {
      id: 'stocks',
      href: '/stocks',
      label: 'Stocks',
      value: `${dimension('inventory')} %`,
      caption: 'Niveau global',
      icon: 'stocks',
      tone: 'orange',
      series: dimensionSeries(history, 'inventoryScore', dimension('inventory')),
    },
    {
      id: 'qualite',
      href: '/qualite',
      label: 'Qualité',
      value: `${Math.round(100 - context.production.scrapRatePct)} %`,
      caption: 'Taux conformité',
      icon: 'quality',
      tone: 'green',
      series: dimensionSeries(history, 'qualityScore', dimension('quality')),
    },
  ];

  /* ── Alertes critiques ──────────────────────────────────────────────── */

  const alerts: AlertsPanelData = {
    totalCount: context.alerts.length,
    alerts: context.alerts.slice(0, 5).map((alert) => ({
      id: alert.id,
      severity: toDashboardSeverity(alert.severity),
      title: alert.title,
      detail: `${DOMAIN_LABELS[alert.domain] ?? alert.domain} · ${formatSince(alert.detectedAt, now)}`,
    })),
  };

  /* ── Production du jour ─────────────────────────────────────────────── */

  const currentHour = Math.min(Math.floor((now.getTime() - dayStart.getTime()) / 3_600_000), 24);

  // Les compteurs horaires précis ne sont pas encore captés en base : la
  // trajectoire jusqu'à l'heure courante est donc une interpolation linéaire
  // entre 0 et le total réel du jour, jamais une courbe inventée.
  const productionPoints: ProductionPoint[] = Array.from({ length: 25 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}h`,
    actual:
      hour > currentHour
        ? null
        : currentHour > 0
          ? Math.round((context.production.producedUnits * hour) / currentHour)
          : hour === 0
            ? 0
            : null,
    target: Math.round((context.production.targetUnits * hour) / 24),
  }));

  const production: ProductionToday = {
    produced: context.production.producedUnits,
    target: context.production.targetUnits,
    completionPct: context.production.achievementPct,
    points: productionPoints,
  };

  /* ── Répartition par atelier ─────────────────────────────────────────── */

  const totalProduced = context.workshops.reduce((total, w) => total + w.producedUnits, 0);
  const workshops: WorkshopShare[] = context.workshops.map((workshop, index) => ({
    id: workshop.id,
    label: workshop.name,
    sharePct: totalProduced > 0 ? Math.round((workshop.producedUnits / totalProduced) * 100) : 0,
    tone: WORKSHOP_TONES[index % WORKSHOP_TONES.length],
  }));

  /* ── Commandes à risque ──────────────────────────────────────────────── */

  const riskOrders: RiskOrder[] = [...context.orders]
    .filter((order) => order.isLate || order.severity === 'critical' || order.severity === 'warning')
    .sort((a, b) => b.riskPct - a.riskPct)
    .slice(0, 4)
    .map((order) => ({
      id: order.id,
      reference: `#${order.number}`,
      status: riskStatusLabel(order),
      severity: toDashboardSeverity(order.severity),
    }));

  /* ── Top des arrêts machines ─────────────────────────────────────────── */

  const stopCounts = new Map<string, number>();
  for (const row of stopEventRows) {
    stopCounts.set(row.machineId, (stopCounts.get(row.machineId) ?? 0) + 1);
  }

  const downtimes: MachineDowntime[] = context.machines
    .filter((machine) => machine.downtimeMinutes > 0)
    .sort((a, b) => b.downtimeMinutes - a.downtimeMinutes)
    .slice(0, 5)
    .map((machine) => {
      const uptimeMinutes = machine.plannedMinutes - machine.downtimeMinutes;
      const hourlyRate = uptimeMinutes > 0 ? machine.producedUnits / (uptimeMinutes / 60) : 0;
      return {
        id: machine.id,
        machine: machine.name,
        downtimeMinutes: machine.downtimeMinutes,
        stopCount: stopCounts.get(machine.id) ?? 0,
        lostUnits: -Math.round((machine.downtimeMinutes / 60) * hourlyRate),
      };
    });

  /* ── Planning — vue Gantt de la semaine courante ─────────────────────── */

  const planning = await buildWeeklyPlanning(db, now);

  /* ── Répartition des coûts du jour ───────────────────────────────────── */

  const costModel = costModelRows[0];
  const costs = buildCostBreakdown(costModel, costProductionRows);

  /* ── KPI clés ─────────────────────────────────────────────────────────── */

  const avgOeePct =
    context.machines.length > 0
      ? Math.round(context.machines.reduce((sum, m) => sum + m.oeePct, 0) / context.machines.length)
      : 0;
  const onTimeCount = context.orders.filter((o) => !o.isLate).length;
  const onTimePct =
    context.orders.length > 0 ? Math.round((onTimeCount / context.orders.length) * 100) : 100;

  const machineDeltaPts = dimension('machines') - (history[0]?.machineScore ?? dimension('machines'));
  const planningDeltaPts = dimension('planning') - (history[0]?.planningScore ?? dimension('planning'));
  const qualityDeltaPts = dimension('quality') - (history[0]?.qualityScore ?? dimension('quality'));

  const keyKpis: KeyKpi[] = [
    {
      id: 'trs',
      label: 'TRS moyen',
      value: `${avgOeePct} %`,
      delta: formatDeltaPoints(machineDeltaPts),
      deltaMeaning: machineDeltaPts > 0 ? 'positive' : machineDeltaPts < 0 ? 'negative' : 'neutral',
      deltaCaption: 'vs relevé précédent',
      tone: 'purple',
      series: dimensionSeries(history, 'machineScore', dimension('machines')),
    },
    {
      id: 'service',
      label: 'Taux de service',
      value: `${onTimePct} %`,
      delta: formatDeltaPoints(planningDeltaPts),
      deltaMeaning: planningDeltaPts > 0 ? 'positive' : planningDeltaPts < 0 ? 'negative' : 'neutral',
      deltaCaption: 'vs relevé précédent',
      tone: 'green',
      series: dimensionSeries(history, 'planningScore', dimension('planning')),
    },
    {
      id: 'rebut',
      label: 'Taux de rebut',
      value: formatPercent(context.production.scrapRatePct, 1),
      // Une hausse du score qualité traduit une baisse du rebut : bonne nouvelle.
      delta: formatDeltaPoints(qualityDeltaPts),
      deltaMeaning: qualityDeltaPts > 0 ? 'positive' : qualityDeltaPts < 0 ? 'negative' : 'neutral',
      deltaCaption: 'score qualité vs relevé précédent',
      tone: 'orange',
      series: dimensionSeries(history, 'qualityScore', dimension('quality')),
    },
    {
      id: 'cout',
      label: 'Coût de production',
      value: formatCompactCents(costs.totalCents),
      delta: '—',
      deltaMeaning: 'neutral',
      deltaCaption: 'Historique de coût indisponible',
      tone: 'blue',
      series: [],
    },
  ];

  return {
    header,
    aiSuggestions: DASHBOARD_AI_SUGGESTIONS,
    kpis,
    alerts,
    production,
    workshops,
    riskOrders,
    factoryStats,
    quickActions,
    downtimes,
    planning,
    costs,
    keyKpis,
  };
}

function riskStatusLabel(order: OrderSnapshot): string {
  if (order.isLate) return 'Retard confirmé';
  if (order.severity === 'critical') return 'Retard probable';
  if (order.severity === 'warning') return 'À surveiller';
  return 'OK';
}

function formatSince(value: Date, reference: Date): string {
  const minutes = Math.max(Math.round((reference.getTime() - value.getTime()) / 60_000), 0);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  return `il y a ${hours} h`;
}

async function buildWeeklyPlanning(
  db: Awaited<ReturnType<typeof getDb>>,
  now: Date,
): Promise<GanttPlanning> {
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const weekStart = startOfDay(new Date(now.getTime() + mondayOffset * 86_400_000));
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart.getTime() + i * 86_400_000);
    return {
      id: `d${i}`,
      dayNumber: String(date.getDate()),
      weekday: WEEKDAY_LABELS[date.getDay()],
    };
  });

  const [machineRows, orderRows] = await Promise.all([
    db
      .select({
        id: t.machines.id,
        name: t.machines.name,
        workshopName: t.workshops.name,
        isActive: t.machines.isActive,
      })
      .from(t.machines)
      .innerJoin(t.workshops, eq(t.machines.workshopId, t.workshops.id))
      .orderBy(t.workshops.code, t.machines.code),
    db
      .select({
        id: t.productionOrders.id,
        number: t.productionOrders.number,
        machineId: t.productionOrders.machineId,
        status: t.productionOrders.status,
        plannedStartAt: t.productionOrders.plannedStartAt,
        plannedEndAt: t.productionOrders.plannedEndAt,
      })
      .from(t.productionOrders)
      .where(
        and(gte(t.productionOrders.plannedStartAt, weekStart), lt(t.productionOrders.plannedStartAt, weekEnd)),
      ),
  ]);

  const rows = machineRows
    .filter((machine) => machine.isActive)
    .map((machine) => ({ id: machine.id, workshop: machine.workshopName, line: machine.name }));

  const tasks = orderRows
    .filter((order) => order.machineId && order.status !== 'cancelled')
    .map((order) => {
      const startDay = Math.floor((order.plannedStartAt.getTime() - weekStart.getTime()) / 86_400_000);
      const lengthDays = Math.max(
        1,
        Math.ceil((order.plannedEndAt.getTime() - order.plannedStartAt.getTime()) / 86_400_000),
      );
      const isLate = order.plannedEndAt < now && order.status !== 'done';

      let status: GanttStatus;
      if (isLate) status = 'late';
      else if (order.status === 'done') status = 'done';
      else if (order.status === 'running') status = 'running';
      else if (order.status === 'paused') status = 'maintenance';
      else status = 'planned';

      return {
        id: order.id,
        rowId: order.machineId as string,
        label: order.number,
        startDay,
        lengthDays,
        status,
      };
    });

  return { weekLabel: `Semaine ${weekNumber(weekStart)}`, days, rows, tasks };
}

type CostProductionRow = {
  producedUnits: number;
  weightGrams: number;
  cycleTimeSeconds: number;
  materialCostCentsPerKg: number | null;
  cavities: number | null;
};

function buildCostBreakdown(
  costModel: typeof t.costModels.$inferSelect | undefined,
  productionRows: CostProductionRow[],
): CostBreakdown {
  let materialCents = 0;
  let laborCents = 0;
  let energyCents = 0;
  let otherCents = 0;

  if (costModel) {
    for (const row of productionRows) {
      if (row.producedUnits <= 0) continue;
      const cavities = row.cavities ?? 1;
      const machineHoursPerUnit = row.cycleTimeSeconds / (3600 * cavities);
      materialCents += (row.weightGrams / 1000) * (row.materialCostCentsPerKg ?? 0) * row.producedUnits;
      energyCents += machineHoursPerUnit * costModel.energyCentsPerHour * row.producedUnits;
      laborCents += machineHoursPerUnit * costModel.laborCentsPerHour * row.producedUnits;
      otherCents +=
        machineHoursPerUnit *
        (costModel.overheadCentsPerHour + costModel.consumablesCentsPerHour) *
        row.producedUnits;
    }
  }

  const totalCents = Math.round(materialCents + laborCents + energyCents + otherCents);
  const share = (cents: number) => (totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0);

  const slices: CostSlice[] = [
    { id: 'matieres', label: 'Matières', sharePct: share(materialCents), amountCents: Math.round(materialCents), tone: 'blue' },
    { id: 'main-oeuvre', label: 'Main d’œuvre', sharePct: share(laborCents), amountCents: Math.round(laborCents), tone: 'green' },
    { id: 'energie', label: 'Énergie', sharePct: share(energyCents), amountCents: Math.round(energyCents), tone: 'orange' },
    { id: 'autres', label: 'Autres', sharePct: share(otherCents), amountCents: Math.round(otherCents), tone: 'purple' },
  ];

  return { periodLabel: "Aujourd'hui", totalCents, slices };
}
