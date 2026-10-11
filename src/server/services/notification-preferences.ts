import 'server-only';

import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { Severity } from '@/components/ui/severity';

export type NotificationPreferences = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  minSeverity: Severity;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailEnabled: false,
  smsEnabled: false,
  pushEnabled: false,
  minSeverity: 'critical',
};

/** Pas de ligne enregistrée = tout désactivé — jamais l'inverse (§ notification-dispatch.ts). */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const db = await getDb();
  const [row] = await db
    .select({
      emailEnabled: t.notificationPreferences.emailEnabled,
      smsEnabled: t.notificationPreferences.smsEnabled,
      pushEnabled: t.notificationPreferences.pushEnabled,
      minSeverity: t.notificationPreferences.minSeverity,
    })
    .from(t.notificationPreferences)
    .where(eq(t.notificationPreferences.userId, userId))
    .limit(1);

  return row ?? DEFAULT_PREFERENCES;
}

export async function getPushSubscriptionCount(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: t.pushSubscriptions.id })
    .from(t.pushSubscriptions)
    .where(eq(t.pushSubscriptions.userId, userId));
  return rows.length;
}
