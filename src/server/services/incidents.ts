import 'server-only';

import { like } from 'drizzle-orm';
import type { Database } from '../db/client';
import * as t from '../db/schema';

/** Produit la prochaine référence en suivant le plus grand rang de l'année. */
export async function nextIncidentReference(db: Database, at: Date) {
  const year = at.getFullYear();
  const prefix = `INC-${year}-`;
  const rows = await db
    .select({ reference: t.incidents.reference })
    .from(t.incidents)
    .where(like(t.incidents.reference, `${prefix}%`));
  const highest = rows.reduce((max, row) => {
    const rank = Number(row.reference.slice(prefix.length));
    return Number.isInteger(rank) ? Math.max(max, rank) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}
