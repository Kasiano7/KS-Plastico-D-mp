import { eq, ne, sql } from 'drizzle-orm';
import type { Database } from './client';
import * as t from './schema';

/**
 * Actifs du site autres que les presses.
 *
 * Les presses reçoivent leur actif dans la migration elle-même. Ce module
 * ajoute ce que la table `machines` ne décrivait pas et que la maintenance
 * doit pourtant entretenir : air comprimé, froid, convoyage, accès, éclairage,
 * ventilation, bâtiments, utilités.
 *
 * Le contenu suit l'usine déjà décrite par le reste du jeu de démonstration —
 * trois ateliers (PU, Injection, Montage/expédition), presses de 180 à 1 500 t.
 * Un compresseur central alimente tout le site, deux groupes froids servent
 * chacun un atelier : c'est cohérent avec une usine d'injection de cette
 * taille, pas tiré au sort (règle n° 10).
 *
 * Idempotent : appelé dix fois, il n'ajoute rien la deuxième.
 */

type AssetSeed = {
  code: string;
  name: string;
  type: (typeof t.assets.$inferInsert)['type'];
  criticality: (typeof t.assets.$inferInsert)['criticality'];
  /** Code de l'atelier de rattachement, ou `null` pour tout le site. */
  workshopCode: string | null;
  location?: string;
  manufacturer?: string;
  model?: string;
};

const SITE_ASSETS: AssetSeed[] = [
  /* ── Air comprimé ── */
  {
    code: 'COMP-01',
    name: 'Compresseur central',
    type: 'compressor',
    // Sans air comprimé, aucune presse ne cycle : c'est le point unique de
    // défaillance du site.
    criticality: 'vital',
    workshopCode: null,
    location: 'Local technique nord',
    manufacturer: 'Fabricant compresseurs A',
    model: 'CA-55 VSD',
  },
  {
    code: 'COMP-02',
    name: 'Compresseur de secours',
    type: 'compressor',
    criticality: 'important',
    workshopCode: null,
    location: 'Local technique nord',
    manufacturer: 'Fabricant compresseurs A',
    model: 'CA-37',
  },
  { code: 'AIR-PU-01', name: 'Enrouleur air — Atelier PU', type: 'air_reel', criticality: 'normal', workshopCode: 'A' },
  { code: 'AIR-IN-01', name: 'Enrouleur air — Atelier Injection', type: 'air_reel', criticality: 'normal', workshopCode: 'B' },

  /* ── Froid ── */
  {
    code: 'FROID-01',
    name: 'Groupe froid — Atelier PU',
    type: 'chiller',
    // Un moule qui ne refroidit plus arrête la presse qu'il équipe.
    criticality: 'vital',
    workshopCode: 'A',
    manufacturer: 'Fabricant groupes froids B',
    model: 'GF-120',
  },
  {
    code: 'FROID-02',
    name: 'Groupe froid — Atelier Injection',
    type: 'chiller',
    criticality: 'vital',
    workshopCode: 'B',
    manufacturer: 'Fabricant groupes froids B',
    model: 'GF-180',
  },

  /* ── Convoyage et logistique ── */
  { code: 'CONV-01', name: 'Convoyeur sortie presses PU', type: 'conveyor', criticality: 'important', workshopCode: 'A' },
  { code: 'CONV-02', name: 'Convoyeur sortie atelier Injection', type: 'conveyor', criticality: 'important', workshopCode: 'B' },
  { code: 'CONV-03', name: 'Convoyeur expédition', type: 'conveyor', criticality: 'important', workshopCode: 'C' },
  { code: 'CHAR-01', name: 'Chariot élévateur', type: 'logistics', criticality: 'important', workshopCode: 'C' },
  { code: 'ROBOT-01', name: 'Robot de préhension — Presse 67', type: 'robotics', criticality: 'important', workshopCode: 'B' },

  /* ── Accès et sécurité ── */
  { code: 'PORTE-01', name: 'Porte sectionnelle quai expédition', type: 'door', criticality: 'important', workshopCode: 'C' },
  { code: 'PORTE-02', name: 'Porte sectionnelle réception matière', type: 'door', criticality: 'important', workshopCode: null },
  { code: 'ACCES-01', name: 'Barrière d’accès parking poids lourds', type: 'access', criticality: 'normal', workshopCode: null },
  { code: 'SECU-01', name: 'Centrale incendie', type: 'safety', criticality: 'vital', workshopCode: null, location: 'Accueil' },
  { code: 'SECU-02', name: 'Éclairage de sécurité', type: 'safety', criticality: 'important', workshopCode: null },

  /* ── Ambiance et énergie ── */
  { code: 'ECL-PU-01', name: 'Éclairage Atelier PU', type: 'lighting', criticality: 'normal', workshopCode: 'A' },
  { code: 'ECL-IN-01', name: 'Éclairage Atelier Injection', type: 'lighting', criticality: 'normal', workshopCode: 'B' },
  { code: 'CTA-01', name: 'Centrale de traitement d’air', type: 'hvac', criticality: 'important', workshopCode: null },
  { code: 'CHAUF-01', name: 'Chaudière gaz', type: 'heating', criticality: 'normal', workshopCode: null },
  {
    code: 'TGBT-01',
    name: 'Tableau général basse tension',
    type: 'electrical',
    // Poste de livraison : son arrêt éteint l'usine entière.
    criticality: 'vital',
    workshopCode: null,
    location: 'Poste de livraison',
  },

  /* ── Bâtiments et utilités ── */
  { code: 'BAT-A', name: 'Bâtiment production', type: 'building', criticality: 'important', workshopCode: null },
  { code: 'BAT-B', name: 'Bâtiment expédition', type: 'building', criticality: 'normal', workshopCode: null },
  { code: 'EAU-01', name: 'Réseau d’eau industrielle', type: 'utility', criticality: 'important', workshopCode: null },
];

export async function seedSiteAssetsIfMissing(db: Database): Promise<number> {
  // Un actif de presse existe déjà (créé par la migration) : on ne compte que
  // le reste, sinon la condition serait toujours fausse.
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t.assets)
    .where(ne(t.assets.type, 'machine'));

  if ((existing?.count ?? 0) > 0) return 0;

  const workshops = await db
    .select({ id: t.workshops.id, code: t.workshops.code })
    .from(t.workshops);
  const workshopByCode = new Map(workshops.map((workshop) => [workshop.code, workshop.id]));

  await db.insert(t.assets).values(
    SITE_ASSETS.map((asset) => ({
      code: asset.code,
      name: asset.name,
      type: asset.type,
      criticality: asset.criticality,
      workshopId: asset.workshopCode ? (workshopByCode.get(asset.workshopCode) ?? null) : null,
      location: asset.location ?? null,
      manufacturer: asset.manufacturer ?? null,
      model: asset.model ?? null,
    })),
  );

  return SITE_ASSETS.length;
}

/**
 * Garantit qu'aucune presse ne reste sans actif.
 *
 * La migration remplit les presses existantes ; celles créées ensuite passent
 * par l'action de création, qui crée l'actif. Ce filet couvre le cas d'une
 * base restaurée depuis une sauvegarde antérieure.
 */
export async function linkMachinesWithoutAsset(db: Database): Promise<number> {
  const orphans = await db
    .select({
      id: t.machines.id,
      code: t.machines.code,
      name: t.machines.name,
      workshopId: t.machines.workshopId,
      manufacturer: t.machines.manufacturer,
      model: t.machines.model,
      serialNumber: t.machines.serialNumber,
      isActive: t.machines.isActive,
    })
    .from(t.machines)
    .where(sql`${t.machines.assetId} is null`);

  for (const machine of orphans) {
    const [asset] = await db
      .insert(t.assets)
      .values({
        code: machine.code,
        name: machine.name,
        type: 'machine',
        criticality: 'vital',
        workshopId: machine.workshopId,
        manufacturer: machine.manufacturer,
        model: machine.model,
        serialNumber: machine.serialNumber,
        isActive: machine.isActive,
      })
      .returning({ id: t.assets.id });

    await db
      .update(t.machines)
      .set({ assetId: asset.id })
      .where(eq(t.machines.id, machine.id));
  }

  return orphans.length;
}
