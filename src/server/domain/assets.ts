/**
 * Référentiel des actifs — règles pures.
 *
 * Ce module ne connaît ni la base ni l'écran : il porte le vocabulaire des
 * actifs et la façon de les ordonner. C'est ce qui permettra de remplacer la
 * maquette de maintenance par des lectures réelles sans réécrire l'interface,
 * qui parle déjà ce vocabulaire.
 */

export const ASSET_TYPES = [
  'machine',
  'press_pu',
  'compressor',
  'chiller',
  'conveyor',
  'air_reel',
  'access',
  'door',
  'lighting',
  'hvac',
  'heating',
  'electrical',
  'robotics',
  'logistics',
  'building',
  'utility',
  'safety',
  'other',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetCriticality = 'vital' | 'important' | 'normal';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
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

export const ASSET_CRITICALITY_LABELS: Record<AssetCriticality, string> = {
  vital: 'Vital',
  important: 'Important',
  normal: 'Normal',
};

/**
 * Ce qu'on perd si l'actif s'arrête, du plus grave au moins grave.
 * Sert à ordonner : à charge égale, on traite d'abord ce dont l'arrêt coûte
 * le plus.
 */
const CRITICALITY_RANK: Record<AssetCriticality, number> = {
  vital: 0,
  important: 1,
  normal: 2,
};

export type AssetRecord = {
  id: string;
  code: string;
  name: string;
  type: AssetType;
  criticality: AssetCriticality;
  workshopName: string | null;
  isActive: boolean;
};

export type AssetCategoryCount = {
  type: AssetType;
  label: string;
  count: number;
  /** Actifs de cette catégorie dont l'arrêt stopperait la production. */
  vitalCount: number;
};

/**
 * Répartition par nature d'actif.
 *
 * Seules les catégories réellement présentes sont renvoyées : afficher
 * « Robotique : 0 » sur un site qui n'a pas de robot remplit l'écran sans rien
 * apprendre. Les catégories sont ordonnées par effectif décroissant, à égalité
 * par ordre du référentiel — jamais au hasard.
 */
export function countByType(assets: readonly AssetRecord[]): AssetCategoryCount[] {
  const counts = new Map<AssetType, AssetCategoryCount>();

  for (const asset of assets) {
    const entry = counts.get(asset.type) ?? {
      type: asset.type,
      label: ASSET_TYPE_LABELS[asset.type],
      count: 0,
      vitalCount: 0,
    };
    entry.count += 1;
    if (asset.criticality === 'vital') entry.vitalCount += 1;
    counts.set(asset.type, entry);
  }

  const order = new Map(ASSET_TYPES.map((type, index) => [type, index]));
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0),
  );
}

/** Tri d'affichage : le plus critique d'abord, puis par code. */
export function sortByCriticality(assets: readonly AssetRecord[]): AssetRecord[] {
  return [...assets].sort(
    (a, b) =>
      CRITICALITY_RANK[a.criticality] - CRITICALITY_RANK[b.criticality] ||
      a.code.localeCompare(b.code, 'fr', { numeric: true }),
  );
}

/** Une valeur hors référentiel s'affiche en « Autre », jamais en brut. */
export function assetTypeOf(value: string): AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value) ? (value as AssetType) : 'other';
}
