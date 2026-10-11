'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUser } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';

/**
 * Préférences de notification hors-app — toujours pour SON PROPRE compte
 * (§ two-factor.ts, même principe) : `requireUser()` suffit, aucune
 * permission particulière.
 */

export type NotificationSettingsState = { ok?: boolean; message?: string; errors?: string[] };

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  minSeverity: z.enum(['normal', 'info', 'warning', 'critical']),
  phoneNumber: z.string().trim().max(20),
});

export async function updateNotificationPreferencesAction(
  _state: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  const user = await requireUser();

  const parsed = preferencesSchema.safeParse({
    emailEnabled: formData.get('emailEnabled') === 'on',
    smsEnabled: formData.get('smsEnabled') === 'on',
    pushEnabled: formData.get('pushEnabled') === 'on',
    minSeverity: formData.get('minSeverity'),
    phoneNumber: String(formData.get('phoneNumber') ?? ''),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  if (parsed.data.smsEnabled && !parsed.data.phoneNumber) {
    return { ok: false, errors: ['Un numéro de téléphone est requis pour activer les SMS.'] };
  }
  if (parsed.data.phoneNumber && !E164_PATTERN.test(parsed.data.phoneNumber)) {
    return { ok: false, errors: ['Numéro invalide — format international attendu, ex. +33612345678.'] };
  }

  const db = await getDb();

  await db
    .insert(t.notificationPreferences)
    .values({
      userId: user.id,
      emailEnabled: parsed.data.emailEnabled,
      smsEnabled: parsed.data.smsEnabled,
      pushEnabled: parsed.data.pushEnabled,
      minSeverity: parsed.data.minSeverity,
    })
    .onConflictDoUpdate({
      target: t.notificationPreferences.userId,
      set: {
        emailEnabled: parsed.data.emailEnabled,
        smsEnabled: parsed.data.smsEnabled,
        pushEnabled: parsed.data.pushEnabled,
        minSeverity: parsed.data.minSeverity,
        updatedAt: new Date(),
      },
    });

  await db
    .update(t.users)
    .set({ phoneNumber: parsed.data.phoneNumber || null })
    .where(eq(t.users.id, user.id));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'user.notification_preferences_updated',
    entityType: 'user',
    entityId: user.id,
  });

  revalidatePath('/mon-compte/notifications');
  return { ok: true, message: 'Préférences enregistrées.' };
}

/* ────────────────────────────────────────────────────── Abonnements push ── */

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(300).optional(),
});

export async function savePushSubscriptionAction(
  input: z.infer<typeof pushSubscriptionSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Abonnement invalide.' };

  const db = await getDb();
  await db
    .insert(t.pushSubscriptions)
    .values({
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      userAgent: parsed.data.userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: t.pushSubscriptions.endpoint,
      set: { p256dh: parsed.data.p256dh, auth: parsed.data.auth, userId: user.id },
    });

  revalidatePath('/mon-compte/notifications');
  return { ok: true };
}

export async function removePushSubscriptionAction(endpoint: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const db = await getDb();
  await db
    .delete(t.pushSubscriptions)
    .where(and(eq(t.pushSubscriptions.userId, user.id), eq(t.pushSubscriptions.endpoint, endpoint)));

  revalidatePath('/mon-compte/notifications');
  return { ok: true };
}
