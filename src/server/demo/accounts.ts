import 'server-only';

import { cache } from 'react';
import { eq, inArray } from 'drizzle-orm';
import { DEMO_ROLES } from '@/config/demo';
import { getDb } from '../db/client';
import * as t from '../db/schema';

export type DemoAccount = {
  /** Clé du point de vue (`?role=`), stable. */
  key: string;
  fullName: string;
  /** Intitulé du rôle tel qu'il est en base — celui que l'application affiche partout. */
  roleLabel: string;
};

/**
 * Comptes proposés au changement d'utilisateur, dans l'ordre de `DEMO_ROLES`.
 * Nom et fonction sont relus en base : le menu affiche exactement les
 * personnes de l'usine de démonstration, avec leur rôle réel.
 */
export const listDemoAccounts = cache(async (): Promise<DemoAccount[]> => {
  const db = await getDb();
  const rows = await db
    .select({ email: t.users.email, fullName: t.users.fullName, roleLabel: t.roles.name })
    .from(t.users)
    .innerJoin(t.roles, eq(t.users.roleId, t.roles.id))
    .where(inArray(t.users.email, DEMO_ROLES.map((role) => role.email)));

  return DEMO_ROLES.flatMap((role) => {
    const row = rows.find((candidate) => candidate.email === role.email);
    return row ? [{ key: role.key, fullName: row.fullName, roleLabel: row.roleLabel }] : [];
  });
});
