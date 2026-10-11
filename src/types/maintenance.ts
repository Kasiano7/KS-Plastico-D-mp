import type { Tone } from '@/types/dashboard';

/**
 * Contrat de données de la GMAO.
 *
 * Ces types décrivent ce que l'écran Maintenance attend, pas ce que la base
 * contient. Le jour où ces informations viendront de PostgreSQL, seule la
 * couche `src/data/maintenance.ts` changera : aucun composant ne bougera.
 *
 * La maintenance couvre ici **l'ensemble du site** — production, utilités,
 * bâtiments, accès, logistique — et pas uniquement les presses.
 */

/* ── Référentiel des actifs ───────────────────────────────────────────────── */

export type AssetTypeKey =
  | 'machine'
  | 'press_pu'
  | 'compressor'
  | 'chiller'
  | 'conveyor'
  | 'air_reel'
  | 'access'
  | 'door'
  | 'lighting'
  | 'hvac'
  | 'heating'
  | 'electrical'
  | 'robotics'
  | 'logistics'
  | 'building'
  | 'utility'
  | 'safety'
  | 'other';

/** Libellés métier : la donnée nomme une clé, l'interface affiche un libellé. */
export const ASSET_TYPE_LABELS: Record<AssetTypeKey, string> = {
  machine: 'Machine de production',
  press_pu: 'Presse PU',
  compressor: 'Compresseur',
  chiller: 'Groupe froid',
  conveyor: 'Convoyeur',
  air_reel: 'Enrouleur air comprimé',
  access: 'Barrière / accès',
  door: 'Porte sectionnelle',
  lighting: 'Éclairage',
  hvac: 'Ventilation',
  heating: 'Chauffage',
  electrical: 'Électricité',
  robotics: 'Robotique',
  logistics: 'Logistique',
  building: 'Bâtiment',
  utility: 'Utilités',
  safety: 'Sécurité',
  other: 'Autre',
};

/* ── Interventions ────────────────────────────────────────────────────────── */

export type InterventionPriority = 'critical' | 'high' | 'medium' | 'low';

export const PRIORITY_LABELS: Record<InterventionPriority, string> = {
  critical: 'Critique',
  high: 'Haute',
  medium: 'Moyenne',
  low: 'Basse',
};

export type InterventionStatus = 'open' | 'planned' | 'in_progress' | 'resolved';

export const STATUS_LABELS: Record<InterventionStatus, string> = {
  open: 'Ouvert',
  planned: 'Planifié',
  in_progress: 'En cours',
  resolved: 'Résolu',
};

export type MaintenanceIntervention = {
  id: string;
  assetType: AssetTypeKey;
  equipment: string;
  subject: string;
  priority: InterventionPriority;
  status: InterventionStatus;
  /** `null` lorsque l'intervention n'est pas encore affectée. */
  assignee: string | null;
  dueLabel: string;
};

/* ── Indicateurs ──────────────────────────────────────────────────────────── */

export type MaintenanceKpi = {
  id: string;
  label: string;
  value: string;
  caption: string;
  /** Second niveau de contexte : objectif, budget, cible. */
  target?: string;
  tone: Tone;
  series: number[];
};

/* ── Calendrier ───────────────────────────────────────────────────────────── */

export type CalendarEvent = {
  id: string;
  /** 0 = lundi … 6 = dimanche. */
  dayIndex: number;
  startHour: number;
  endHour: number;
  title: string;
  subtitle: string;
  owner: string;
  tone: Tone;
};

export type MaintenanceWeek = {
  label: string;
  rangeLabel: string;
  days: string[];
  /** Bornes horaires affichées dans la grille. */
  startHour: number;
  endHour: number;
  events: CalendarEvent[];
};

/* ── Affectation intelligente ─────────────────────────────────────────────── */

export type TechnicianLoad = {
  id: string;
  name: string;
  skill: string;
  loadPct: number;
};

export type SkillGap = {
  message: string;
  nextAvailability: string;
};

/* ── Répartitions ─────────────────────────────────────────────────────────── */

export type DistributionSlice = {
  id: string;
  label: string;
  sharePct: number;
  count: number;
  tone: Tone;
};

/* ── Tableaux secondaires ─────────────────────────────────────────────────── */

export type PreventiveTask = {
  id: string;
  when: string;
  assetType: AssetTypeKey;
  equipment: string;
  intervention: string;
  technician: string;
  status: 'planned' | 'confirmed';
};

export type HistoryEntry = {
  id: string;
  when: string;
  assetType: AssetTypeKey;
  equipment: string;
  intervention: string;
  duration: string;
};

export type CriticalPart = {
  id: string;
  part: string;
  equipment: string;
  stock: number;
  threshold: number;
};

export type AssetCategory = {
  id: string;
  label: string;
  count: number;
  href: string;
};

/* ── Agrégat de page ──────────────────────────────────────────────────────── */

export type MaintenanceOverviewData = {
  kpis: MaintenanceKpi[];
  interventions: MaintenanceIntervention[];
  week: MaintenanceWeek;
  technicians: TechnicianLoad[];
  skillGap: SkillGap;
  requestDistribution: DistributionSlice[];
  requestTotal: number;
  resolution: { resolved: number; trendLabel: string; series: number[] };
  preventive: PreventiveTask[];
  preventiveCount: number;
  history: HistoryEntry[];
  criticalParts: CriticalPart[];
  causes: DistributionSlice[];
  causeTotal: number;
  assets: AssetCategory[];
  assetTotal: number;
};

/* ── Options du formulaire de planification ───────────────────────────────── */

export type SelectOption = { value: string; label: string };
