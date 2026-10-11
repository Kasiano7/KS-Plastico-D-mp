import 'server-only';

import { cache } from 'react';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { EmployeeIdentity } from '../domain/ai-privacy';

/**
 * Répertoire minimal des identités salariées, utilisé **uniquement** par la
 * couche de confidentialité IA (`domain/ai-privacy.ts`) pour détecter et
 * pseudonymiser toute mention d'un salarié avant un appel à un fournisseur
 * IA distant. Ne jamais réutiliser ce résultat pour l'affichage : les pages
 * de l'application lisent `employees` directement (voir `personnel/page.tsx`).
 *
 * Volontairement indépendant des permissions de l'utilisateur courant : la
 * pseudonymisation du texte libre d'une question doit protéger l'identité
 * de **tous** les salariés, y compris ceux hors du périmètre de la personne
 * qui interroge le copilote (§18 — ne pas compter uniquement sur le RBAC
 * appliqué aux données structurées).
 */
export const getEmployeeDirectory = cache(async (): Promise<EmployeeIdentity[]> => {
  const db = await getDb();
  return db
    .select({
      id: t.employees.id,
      matricule: t.employees.matricule,
      firstName: t.employees.firstName,
      lastName: t.employees.lastName,
    })
    .from(t.employees)
    .where(eq(t.employees.isActive, true));
});
