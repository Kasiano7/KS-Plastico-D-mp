import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  assetTypeOf,
  countByType,
  sortByCriticality,
  type AssetCategoryCount,
  type AssetRecord,
} from '../domain/assets';

/**
 * Lecture du référentiel des actifs.
 *
 * C'est ce qui manquait pour que la maintenance de site cesse d'être une
 * maquette : jusqu'ici, seules les presses existaient en base, et tout ce que
 * l'écran affichait sur les compresseurs, les groupes froids ou les bâtiments
 * était écrit à la main.
 */

export type AssetInventory = {
  assets: AssetRecord[];
  categories: AssetCategoryCount[];
  total: number;
  /** Actifs dont l'arrêt stopperait la production. */
  vitalCount: number;
};

export const getAssetInventory = cache(async (): Promise<AssetInventory> => {
  const db = await getDb();

  const rows = await db
    .select({
      id: t.assets.id,
      code: t.assets.code,
      name: t.assets.name,
      type: t.assets.type,
      criticality: t.assets.criticality,
      workshopName: t.workshops.name,
      isActive: t.assets.isActive,
    })
    .from(t.assets)
    .leftJoin(t.workshops, eq(t.assets.workshopId, t.workshops.id))
    .where(eq(t.assets.isActive, true))
    .orderBy(t.assets.code);

  const assets: AssetRecord[] = rows.map((row) => ({
    ...row,
    // Un type retiré du référentiel ne doit pas casser la lecture.
    type: assetTypeOf(row.type),
  }));

  return {
    assets: sortByCriticality(assets),
    categories: countByType(assets),
    total: assets.length,
    vitalCount: assets.filter((asset) => asset.criticality === 'vital').length,
  };
});
