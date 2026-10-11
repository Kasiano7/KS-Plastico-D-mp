/**
 * Contrat de données du tableau de bord.
 *
 * Ces types décrivent ce que l'écran attend, pas ce que la base contient :
 * quand les données viendront d'une API, de l'ERP ou d'une passerelle OPC UA,
 * seule la couche `src/data` changera. Aucun composant ne devra bouger.
 *
 * Règle KS Plastico Demo : l'argent est en centimes, en entiers. Jamais de flottant.
 */

/** Teintes fonctionnelles du design system. Une teinte = un domaine. */
export type Tone = 'blue' | 'cyan' | 'purple' | 'orange' | 'green' | 'red' | 'neutral';

/** Quatre niveaux de gravité, jamais plus. La couleur n'est jamais seule. */
export type Severity = 'critical' | 'warning' | 'info' | 'success';

/** Clés d'icônes : la donnée nomme une intention, le composant choisit l'icône. */
export type IconKey =
  | 'home'
  | 'production'
  | 'stocks'
  | 'planning'
  | 'machines'
  | 'maintenance'
  | 'quality'
  | 'purchasing'
  | 'logistics'
  | 'reports'
  | 'settings'
  | 'orders'
  | 'alerts'
  | 'daily-report'
  | 'order-tracking';

/* ── Coquille applicative ─────────────────────────────────────────────────── */

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  icon: IconKey;
};

export type CurrentUser = {
  fullName: string;
  role: string;
};

export type HeaderInfo = {
  greeting: string;
  subtitle: string;
  /** Date et heure figées côté données : le rendu serveur et le rendu client
   *  doivent produire exactement la même chaîne. */
  date: string;
  time: string;
  unreadNotifications: number;
};

/* ── Barre IA ─────────────────────────────────────────────────────────────── */

export type AiSuggestion = {
  id: string;
  label: string;
};

/* ── KPI principaux ───────────────────────────────────────────────────────── */

export type KpiCard = {
  id: string;
  href: string;
  label: string;
  value: string;
  caption: string;
  icon: IconKey;
  tone: Tone;
  /** Série normalisée pour la sparkline — 1 point = 1 heure. */
  series: number[];
};

/* ── Alertes ──────────────────────────────────────────────────────────────── */

export type CriticalAlert = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
};

export type AlertsPanelData = {
  alerts: CriticalAlert[];
  totalCount: number;
};

/* ── Production du jour ───────────────────────────────────────────────────── */

export type ProductionPoint = {
  /** Libellé d'axe (« 00h », « 04h »…). */
  hour: string;
  /** Cumul réalisé — `null` pour les heures à venir : on n'invente pas. */
  actual: number | null;
  /** Cumul attendu au même instant. */
  target: number;
};

export type ProductionToday = {
  produced: number;
  target: number;
  completionPct: number;
  points: ProductionPoint[];
};

/* ── Répartition par atelier ──────────────────────────────────────────────── */

export type WorkshopShare = {
  id: string;
  label: string;
  sharePct: number;
  tone: Tone;
};

/* ── Commandes à risque ───────────────────────────────────────────────────── */

export type RiskOrder = {
  id: string;
  reference: string;
  status: string;
  severity: Severity;
};

/* ── Vue globale de l'usine ───────────────────────────────────────────────── */

export type FactoryStat = {
  id: string;
  label: string;
  value: string;
  caption: string;
  icon: IconKey;
  tone: Tone;
};

/* ── Accès rapides ────────────────────────────────────────────────────────── */

export type QuickAction = {
  id: string;
  label: string;
  href: string;
  icon: IconKey;
  tone: Tone;
};

/* ── Arrêts machines ──────────────────────────────────────────────────────── */

export type MachineDowntime = {
  id: string;
  machine: string;
  /** Durée cumulée d'arrêt, en minutes. Le formatage est une affaire de vue. */
  downtimeMinutes: number;
  stopCount: number;
  /** Unités perdues, toujours négatives. */
  lostUnits: number;
};

/* ── Planning — vue Gantt ─────────────────────────────────────────────────── */

export type GanttStatus = 'done' | 'running' | 'planned' | 'late' | 'maintenance';

export type GanttRow = {
  id: string;
  workshop: string;
  line: string;
};

export type GanttTask = {
  id: string;
  rowId: string;
  label: string;
  /** Index de jour de début (0 = premier jour affiché). */
  startDay: number;
  /** Durée en jours, minimum 1. */
  lengthDays: number;
  status: GanttStatus;
};

export type GanttDay = {
  id: string;
  dayNumber: string;
  weekday: string;
};

export type GanttPlanning = {
  weekLabel: string;
  days: GanttDay[];
  rows: GanttRow[];
  tasks: GanttTask[];
};

/* ── Répartition des coûts ────────────────────────────────────────────────── */

export type CostSlice = {
  id: string;
  label: string;
  sharePct: number;
  amountCents: number;
  tone: Tone;
};

export type CostBreakdown = {
  periodLabel: string;
  totalCents: number;
  slices: CostSlice[];
};

/* ── KPI clés ─────────────────────────────────────────────────────────────── */

export type KeyKpi = {
  id: string;
  label: string;
  value: string;
  /** Variation déjà formatée (« +4,2 % »), et son interprétation métier :
   *  une baisse du taux de rebut est une bonne nouvelle. `'neutral'` quand
   *  l'historique disponible ne permet pas encore de calculer un écart. */
  delta: string;
  deltaMeaning: 'positive' | 'negative' | 'neutral';
  deltaCaption: string;
  tone: Tone;
  series: number[];
};

/* ── Agrégat de l'écran ───────────────────────────────────────────────────── */

export type DashboardData = {
  header: HeaderInfo;
  aiSuggestions: AiSuggestion[];
  kpis: KpiCard[];
  alerts: AlertsPanelData;
  production: ProductionToday;
  workshops: WorkshopShare[];
  riskOrders: RiskOrder[];
  factoryStats: FactoryStat[];
  quickActions: QuickAction[];
  downtimes: MachineDowntime[];
  planning: GanttPlanning;
  costs: CostBreakdown;
  keyKpis: KeyKpi[];
};
