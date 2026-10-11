'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { decideRecommendation } from '../services/recommendations';

export type ActionState = { ok?: boolean; message?: string };

const decisionSchema = z.object({
  recommendationId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  justification: z.string().max(500).optional(),
});

/** Approuve ou refuse une recommandation IA — décision humaine, tracée. */
export async function decideRecommendationAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('recommendations:approve');

  const parsed = decisionSchema.safeParse({
    recommendationId: formData.get('recommendationId'),
    decision: formData.get('decision'),
    justification: formData.get('justification') || undefined,
  });

  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const result = await decideRecommendation(
    parsed.data.recommendationId,
    user,
    parsed.data.decision,
    parsed.data.justification,
  );

  revalidatePath('/alertes');
  revalidatePath('/');
  revalidatePath('/planning');
  revalidatePath('/commandes');

  return { ok: result.ok, message: result.message };
}

const acknowledgeSchema = z.object({ alertId: z.uuid(), action: z.enum(['acknowledge', 'resolve']) });

/** Prise en charge ou clôture d'une alerte. */
export async function updateAlertStatusAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('alerts:write');

  const parsed = acknowledgeSchema.safeParse({
    alertId: formData.get('alertId'),
    action: formData.get('action'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [alert] = await db.select().from(t.alerts).where(eq(t.alerts.id, parsed.data.alertId)).limit(1);
  if (!alert) return { ok: false, message: 'Alerte introuvable.' };

  const now = new Date();
  const next =
    parsed.data.action === 'acknowledge'
      ? { status: 'acknowledged' as const, acknowledgedAt: now, acknowledgedBy: user.id }
      : { status: 'resolved' as const, resolvedAt: now };

  await db.update(t.alerts).set(next).where(eq(t.alerts.id, alert.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: parsed.data.action === 'acknowledge' ? 'alert.acknowledge' : 'alert.resolve',
    entityType: 'alert',
    entityId: alert.id,
    entityLabel: alert.title,
    previousValue: { status: alert.status },
    newValue: { status: next.status },
  });

  revalidatePath('/alertes');
  revalidatePath('/');

  return {
    ok: true,
    message: parsed.data.action === 'acknowledge' ? 'Alerte prise en charge.' : 'Alerte clôturée.',
  };
}
