'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';

export type CostModelActionState = { ok?: boolean; message?: string; errors?: string[] };

/**
 * Le modèle de coût pilote tout calcul d'impact financier (rentabilité,
 * impact des alertes, coût de production). Modifier un tarif ici change
 * immédiatement ces calculs pour l'ensemble de l'application — d'où la
 * même permission que le reste de l'administration (§ADR-006 : les
 * montants restent des centimes entiers en base, l'euro n'existe qu'au
 * formulaire).
 */
const formSchema = z.object({
  costModelId: z.uuid(),
  name: z.string().min(1, 'Nom requis.').max(120),
  energyEuros: z.coerce.number().min(0).max(10_000),
  laborEuros: z.coerce.number().min(0).max(10_000),
  overheadEuros: z.coerce.number().min(0).max(10_000),
  consumablesEuros: z.coerce.number().min(0).max(10_000),
});

export async function updateCostModelAction(
  _state: CostModelActionState,
  formData: FormData,
): Promise<CostModelActionState> {
  const user = await assertPermission('admin:write');

  const parsed = formSchema.safeParse({
    costModelId: formData.get('costModelId'),
    name: formData.get('name'),
    energyEuros: formData.get('energyEuros') || 0,
    laborEuros: formData.get('laborEuros') || 0,
    overheadEuros: formData.get('overheadEuros') || 0,
    consumablesEuros: formData.get('consumablesEuros') || 0,
  });
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(t.costModels)
    .where(eq(t.costModels.id, parsed.data.costModelId))
    .limit(1);
  if (!existing) return { ok: false, message: 'Modèle de coût introuvable.' };

  const next = {
    name: parsed.data.name,
    energyCentsPerHour: Math.round(parsed.data.energyEuros * 100),
    laborCentsPerHour: Math.round(parsed.data.laborEuros * 100),
    overheadCentsPerHour: Math.round(parsed.data.overheadEuros * 100),
    consumablesCentsPerHour: Math.round(parsed.data.consumablesEuros * 100),
  };

  await db.update(t.costModels).set(next).where(eq(t.costModels.id, existing.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'cost_model.update',
    entityType: 'cost_model',
    entityId: existing.id,
    entityLabel: next.name,
    previousValue: {
      name: existing.name,
      energyCentsPerHour: existing.energyCentsPerHour,
      laborCentsPerHour: existing.laborCentsPerHour,
      overheadCentsPerHour: existing.overheadCentsPerHour,
      consumablesCentsPerHour: existing.consumablesCentsPerHour,
    },
    newValue: next,
  });

  revalidatePath('/administration');
  return { ok: true, message: 'Modèle de coût mis à jour.' };
}
