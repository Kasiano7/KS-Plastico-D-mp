import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { getNotificationPreferences, getPushSubscriptionCount } from '@/server/services/notification-preferences';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { NotificationSettings } from './notification-settings';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * Accessible à tout utilisateur authentifié pour son propre compte, sans
 * permission particulière (§ server/actions/notification-preferences.ts).
 */
export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const db = await getDb();

  const [preferences, pushSubscriptionCount, [row]] = await Promise.all([
    getNotificationPreferences(user.id),
    getPushSubscriptionCount(user.id),
    db.select({ phoneNumber: t.users.phoneNumber }).from(t.users).where(eq(t.users.id, user.id)).limit(1),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-fg">Notifications</h1>
        <p className="text-sm text-fg-muted">
          {user.fullName} — {user.email}
        </p>
      </div>

      <Panel>
        <PanelHeader title="Canaux de notification" />
        <div className="px-3.5 pb-4">
          <NotificationSettings
            preferences={preferences}
            phoneNumber={row?.phoneNumber ?? null}
            pushSubscriptionCount={pushSubscriptionCount}
            emailConfigured={Boolean(process.env.RESEND_EMAIL_API_KEY)}
            smsConfigured={Boolean(process.env.TWILIO_ACCOUNT_SID)}
            pushConfigured={Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY)}
            vapidPublicKey={process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null}
          />
        </div>
      </Panel>
    </div>
  );
}
