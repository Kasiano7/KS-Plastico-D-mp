import type { MaintenanceOverviewData, SelectOption } from '@/types/maintenance';

/**
 * Jeu de données de la GMAO — **maquette**.
 *
 * Rangé sous `server/db/fixtures/` et non dans un dossier de lecture : le
 * chemin doit dire ce que le contenu est. Ces valeurs ne viennent d'aucune
 * mesure ; elles sont écrites à la main pour que l'écran soit lisible avant
 * que le référentiel d'actifs n'existe.
 *
 * Volontairement isolé des composants : aucun écran ne connaît ces valeurs, il
 * reçoit un objet typé. Le jour où la maintenance de site sera modélisée en
 * base (actifs, interventions, gammes préventives), il suffira de remplacer le
 * corps de `getMaintenanceOverview()` par des requêtes : la signature ne bouge
 * pas, donc aucun composant n'est touché.
 *
 * Les chiffres racontent une situation cohérente : 42 demandes ouvertes, dont
 * une fuite d'huile critique sur la Presse 03, un compresseur bruyant, des
 * pièces critiques sous seuil et un mécanicien déjà chargé à 61 %.
 */

export const MAINTENANCE_OVERVIEW: MaintenanceOverviewData = {
  kpis: [
    {
      id: 'open-requests',
      label: 'Demandes ouvertes',
      value: '42',
      caption: '+4 vs hier',
      tone: 'red',
      series: [28, 31, 30, 34, 33, 36, 38, 37, 40, 42],
    },
    {
      id: 'upcoming-preventive',
      label: 'Préventifs à venir',
      value: '28',
      caption: '+2 vs hier',
      tone: 'orange',
      series: [18, 20, 19, 22, 24, 23, 25, 26, 26, 28],
    },
    {
      id: 'availability',
      label: 'Disponibilité maintenance',
      value: '91,4 %',
      caption: '+2,1 pts vs mois N-1',
      target: 'Cible ≥ 90 %',
      tone: 'green',
      series: [86, 87, 86, 88, 89, 88, 90, 90, 91, 91.4],
    },
    {
      id: 'mtti',
      label: 'Temps moyen d’intervention',
      value: '56 min',
      caption: '−7 min vs mois N-1',
      target: 'Cible ≤ 60 min',
      tone: 'blue',
      series: [72, 70, 68, 66, 67, 63, 61, 60, 58, 56],
    },
    {
      id: 'cost',
      label: 'Coût maintenance (mois)',
      value: '128 450 €',
      caption: '−12,6 % vs budget',
      target: 'Budget : 140 000 €',
      tone: 'purple',
      series: [96, 104, 112, 108, 118, 121, 117, 124, 126, 128],
    },
  ],

  interventions: [
    {
      id: 'INC-2026-1176',
      assetType: 'machine',
      equipment: 'Presse 03',
      subject: 'Fuite d’huile importante',
      priority: 'critical',
      status: 'open',
      assignee: 'Maxime Rolland',
      dueLabel: '16/05 09:00',
    },
    {
      id: 'INC-2026-1175',
      assetType: 'compressor',
      equipment: 'Compresseur 02',
      subject: 'Bruits anormaux',
      priority: 'high',
      status: 'open',
      assignee: 'Rayan Masson',
      dueLabel: '16/05 10:30',
    },
    {
      id: 'INC-2026-1174',
      assetType: 'machine',
      equipment: 'Centre usinage 05',
      subject: 'Vibration élevée',
      priority: 'medium',
      status: 'planned',
      assignee: 'Amel Henry',
      dueLabel: '16/05 14:00',
    },
    {
      id: 'INC-2026-1173',
      assetType: 'hvac',
      equipment: 'AHU Production',
      subject: 'Débit d’air faible',
      priority: 'high',
      status: 'open',
      assignee: null,
      dueLabel: '16/05 15:00',
    },
    {
      id: 'INC-2026-1172',
      assetType: 'conveyor',
      equipment: 'Convoyeur 02',
      subject: 'Tension courroie',
      priority: 'high',
      status: 'open',
      assignee: null,
      dueLabel: '17/05 08:00',
    },
    {
      id: 'INC-2026-1171',
      assetType: 'lighting',
      equipment: 'Zone Entrepôt',
      subject: 'Lampe défectueuse',
      priority: 'low',
      status: 'resolved',
      assignee: 'Théo Vidal',
      dueLabel: '15/05 16:30',
    },
    {
      id: 'INC-2026-1170',
      assetType: 'chiller',
      equipment: 'GF-01',
      subject: 'Température élevée',
      priority: 'medium',
      status: 'in_progress',
      assignee: 'Maxime Rolland',
      dueLabel: '16/05 18:00',
    },
    {
      id: 'INC-2026-1169',
      assetType: 'logistics',
      equipment: 'Parc Levant 03',
      subject: 'Frein hydraulique',
      priority: 'low',
      status: 'open',
      assignee: null,
      dueLabel: '20/05 08:00',
    },
  ],

  week: {
    label: 'Semaine 20',
    rangeLabel: '13 – 19 mai 2026',
    days: ['Lun 13', 'Mar 14', 'Mer 15', 'Jeu 16', 'Ven 17', 'Sam 18', 'Dim 19'],
    startHour: 8,
    endHour: 18,
    events: [
      {
        id: 'evt-1',
        dayIndex: 0,
        startHour: 8,
        endHour: 10,
        title: 'Presse 03',
        subtitle: 'Inspection',
        owner: 'Maxime R.',
        tone: 'red',
      },
      {
        id: 'evt-2',
        dayIndex: 0,
        startHour: 11,
        endHour: 13,
        title: 'Compresseur 02',
        subtitle: 'Maintenance utilités',
        owner: 'Rayan M.',
        tone: 'orange',
      },
      {
        id: 'evt-3',
        dayIndex: 1,
        startHour: 16,
        endHour: 18,
        title: 'Éclairage LED',
        subtitle: 'Remplacement',
        owner: 'Théo V.',
        tone: 'cyan',
      },
      {
        id: 'evt-4',
        dayIndex: 2,
        startHour: 12,
        endHour: 14,
        title: 'Porte Quai 2',
        subtitle: 'Contrôle annuel',
        owner: 'Équipe bâtiment',
        tone: 'green',
      },
      {
        id: 'evt-5',
        dayIndex: 3,
        startHour: 10,
        endHour: 12,
        title: 'AHU Production',
        subtitle: 'Contrôle',
        owner: 'Loïc B.',
        tone: 'purple',
      },
      {
        id: 'evt-6',
        dayIndex: 3,
        startHour: 15,
        endHour: 17,
        title: 'Convoyeur 05',
        subtitle: 'Atelier logistique',
        owner: 'Amel H.',
        tone: 'cyan',
      },
      {
        id: 'evt-7',
        dayIndex: 4,
        startHour: 14,
        endHour: 16,
        title: 'Chariot élévateur',
        subtitle: 'Réparation',
        owner: 'Ext. 1',
        tone: 'blue',
      },
    ],
  },

  technicians: [
    { id: 'tech-1', name: 'Maxime Rolland', skill: 'Maintenance utilités', loadPct: 28 },
    { id: 'tech-2', name: 'Rayan Masson', skill: 'Électrique / mécanique', loadPct: 35 },
    { id: 'tech-3', name: 'Amel Henry', skill: 'Sécurité / Accès', loadPct: 25 },
    { id: 'tech-4', name: 'Loïc Barbier', skill: 'Mécanique', loadPct: 61 },
    { id: 'tech-5', name: 'Hugo Renard', skill: 'Bâtiment', loadPct: 48 },
  ],

  skillGap: {
    message: 'Aucune compétence disponible',
    nextAvailability: '10/05 à 14:00',
  },

  requestDistribution: [
    { id: 'dist-1', label: 'Machines / Production', sharePct: 38, count: 16, tone: 'blue' },
    { id: 'dist-2', label: 'Utilités / Énergie', sharePct: 21, count: 9, tone: 'cyan' },
    { id: 'dist-3', label: 'Accès / Sécurité', sharePct: 14, count: 6, tone: 'purple' },
    { id: 'dist-4', label: 'Bâtiments / Infrastructures', sharePct: 12, count: 5, tone: 'orange' },
    { id: 'dist-5', label: 'Logistique / Convoyage', sharePct: 9, count: 4, tone: 'green' },
    { id: 'dist-6', label: 'Éclairage / Ventilation', sharePct: 6, count: 2, tone: 'neutral' },
  ],
  requestTotal: 42,

  resolution: {
    resolved: 101,
    trendLabel: '+12 % vs mois N-1',
    series: [72, 76, 74, 80, 84, 82, 88, 91, 96, 101],
  },

  preventive: [
    {
      id: 'prev-1',
      when: '15/05 08:00',
      assetType: 'chiller',
      equipment: 'GF-01',
      intervention: 'Nettoyage échangeur',
      technician: 'Équipe froid',
      status: 'confirmed',
    },
    {
      id: 'prev-2',
      when: '15/05 09:30',
      assetType: 'compressor',
      equipment: 'Compresseur 02',
      intervention: 'Vidange / filtres',
      technician: 'Rayan Masson',
      status: 'confirmed',
    },
    {
      id: 'prev-3',
      when: '15/05 11:00',
      assetType: 'machine',
      equipment: 'Presse 03',
      intervention: 'Vérification périodique',
      technician: 'Maxime Rolland',
      status: 'planned',
    },
    {
      id: 'prev-4',
      when: '15/05 14:30',
      assetType: 'heating',
      equipment: 'AHU Nord',
      intervention: 'Test sécurité',
      technician: 'Amel Henry',
      status: 'planned',
    },
  ],
  preventiveCount: 28,

  history: [
    {
      id: 'hist-1',
      when: '14/05 16:20',
      assetType: 'lighting',
      equipment: 'Allée E1',
      intervention: 'Remplacement LED',
      duration: '1 h 20',
    },
    {
      id: 'hist-2',
      when: '14/05 13:10',
      assetType: 'machine',
      equipment: 'Presse 03',
      intervention: 'Réglage pression',
      duration: '2 h 15',
    },
    {
      id: 'hist-3',
      when: '14/05 10:50',
      assetType: 'compressor',
      equipment: 'Compresseur 02',
      intervention: 'Changement filtre',
      duration: '1 h 05',
    },
    {
      id: 'hist-4',
      when: '14/05 09:45',
      assetType: 'hvac',
      equipment: 'AHU Production',
      intervention: 'Nettoyage filtre',
      duration: '1 h 30',
    },
  ],

  criticalParts: [
    { id: 'part-1', part: 'Courroie profilée M22', equipment: 'Convoyeur 03', stock: 3, threshold: 10 },
    { id: 'part-2', part: 'Carte relais 24V', equipment: 'Enfileuse 01', stock: 2, threshold: 5 },
    { id: 'part-3', part: 'Garniture pompe K22', equipment: 'Groupe froid GF-01', stock: 1, threshold: 6 },
    { id: 'part-4', part: 'Filtre à air compresseur', equipment: 'Compresseur 02', stock: 4, threshold: 12 },
    { id: 'part-5', part: 'Lubrifiant ISO 46 20 L', equipment: 'Lubr. centralisée', stock: 2, threshold: 6 },
  ],

  causes: [
    { id: 'cause-1', label: 'Usure / vieillissement', sharePct: 36, count: 15, tone: 'blue' },
    { id: 'cause-2', label: 'Réglage / paramétrage', sharePct: 21, count: 9, tone: 'cyan' },
    { id: 'cause-3', label: 'Défaut matériel', sharePct: 19, count: 8, tone: 'purple' },
    { id: 'cause-4', label: 'Manque de maintenance', sharePct: 14, count: 6, tone: 'orange' },
    { id: 'cause-5', label: 'Utilisation / exploitation', sharePct: 5, count: 2, tone: 'green' },
    { id: 'cause-6', label: 'Autres causes', sharePct: 5, count: 2, tone: 'neutral' },
  ],
  causeTotal: 42,

  assets: [
    { id: 'asset-1', label: 'Machines de production', count: 92, href: '/machines' },
    { id: 'asset-2', label: 'Utilités (élec., eau, gaz)', count: 82, href: '/maintenance?onglet=utilites' },
    { id: 'asset-3', label: 'Actifs / stocks', count: 67, href: '/stocks' },
    { id: 'asset-4', label: 'Bâtiments / infrastructures', count: 56, href: '/maintenance?onglet=utilites' },
    { id: 'asset-5', label: 'Logistique / convoyage', count: 43, href: '/maintenance?onglet=interventions' },
    { id: 'asset-6', label: 'Éclairage / ventilation', count: 32, href: '/maintenance?onglet=utilites' },
  ],
  assetTotal: 372,
};

/**
 * Point d'accès unique de l'écran. Asynchrone dès maintenant : le passage à la
 * base ne changera pas la signature, donc pas les composants.
 */
export async function getMaintenanceOverview(): Promise<MaintenanceOverviewData> {
  return MAINTENANCE_OVERVIEW;
}

/* ── Options du formulaire « Planifier une intervention » ─────────────────── */

export const ASSET_TYPE_OPTIONS: SelectOption[] = [
  { value: 'machine', label: 'Machine de production' },
  { value: 'compressor', label: 'Compresseur' },
  { value: 'chiller', label: 'Groupe froid' },
  { value: 'conveyor', label: 'Convoyeur' },
  { value: 'access', label: 'Barrière / accès' },
  { value: 'building', label: 'Bâtiment' },
  { value: 'electrical', label: 'Électricité' },
  { value: 'hvac', label: 'Ventilation' },
  { value: 'lighting', label: 'Éclairage' },
  { value: 'safety', label: 'Sécurité' },
  { value: 'robotics', label: 'Robotique' },
  { value: 'logistics', label: 'Logistique' },
  { value: 'other', label: 'Autre' },
];

export const EQUIPMENT_OPTIONS: SelectOption[] = [
  { value: 'presse-03', label: 'Presse 03 — Atelier B' },
  { value: 'presse-12', label: 'Presse 12 — Atelier A' },
  { value: 'compresseur-02', label: 'Compresseur 02 — Local utilités' },
  { value: 'gf-01', label: 'Groupe froid GF-01 — Toiture' },
  { value: 'convoyeur-02', label: 'Convoyeur 02 — Expédition' },
  { value: 'ahu-production', label: 'AHU Production — Atelier B' },
  { value: 'ahu-nord', label: 'AHU Nord — Bureaux' },
  { value: 'porte-quai-2', label: 'Porte sectionnelle Quai 2' },
  { value: 'barriere-nord', label: 'Barrière automatique Accès Nord' },
  { value: 'zone-entrepot', label: 'Éclairage Zone Entrepôt' },
  { value: 'chariot-03', label: 'Chariot élévateur Parc Levant 03' },
];

export const INTERVENTION_TYPE_OPTIONS: SelectOption[] = [
  { value: 'curative', label: 'Curative' },
  { value: 'preventive', label: 'Préventive' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'controle', label: 'Contrôle' },
  { value: 'amelioration', label: 'Amélioration' },
];

export const PRIORITY_OPTIONS: SelectOption[] = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
];

export const TECHNICIAN_OPTIONS: SelectOption[] = [
  { value: 'lucas-martin', label: 'Maxime Rolland — Maintenance utilités' },
  { value: 'sofiane-belaidi', label: 'Rayan Masson — Électrique / mécanique' },
  { value: 'nadia-belkacem', label: 'Amel Henry — Sécurité / accès' },
  { value: 'julien-moreau', label: 'Loïc Barbier — Mécanique' },
  { value: 'antoine-girard', label: 'Hugo Renard — Bâtiment' },
  { value: 'externe', label: 'Prestataire externe' },
];

export const SKILL_OPTIONS: SelectOption[] = [
  { value: 'mecanique', label: 'Mécanique' },
  { value: 'electrique', label: 'Électrique' },
  { value: 'hydraulique', label: 'Hydraulique' },
  { value: 'frigorifique', label: 'Frigorifique' },
  { value: 'automatisme', label: 'Automatisme' },
  { value: 'batiment', label: 'Bâtiment / second œuvre' },
  { value: 'securite', label: 'Sécurité' },
];

export const DURATION_OPTIONS: SelectOption[] = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 heure' },
  { value: '120', label: '2 heures' },
  { value: '240', label: '4 heures' },
  { value: '480', label: '1 journée' },
];

export const PRODUCTION_IMPACT_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'low', label: 'Faible' },
  { value: 'moderate', label: 'Modéré' },
  { value: 'high', label: 'Important' },
  { value: 'stop', label: 'Arrêt nécessaire' },
];

export const URGENCY_OPTIONS: SelectOption[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'eleve', label: 'Élevé' },
  { value: 'immediat', label: 'Immédiat' },
];

export const RECURRENCE_OPTIONS: SelectOption[] = [
  { value: 'once', label: 'Ponctuelle' },
  { value: 'weekly', label: 'Hebdomadaire' },
  { value: 'monthly', label: 'Mensuelle' },
  { value: 'quarterly', label: 'Trimestrielle' },
  { value: 'biannual', label: 'Semestrielle' },
  { value: 'annual', label: 'Annuelle' },
  { value: 'custom', label: 'Personnalisée' },
];
