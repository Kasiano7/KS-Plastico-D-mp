import 'server-only';

import { and, eq, inArray, or } from 'drizzle-orm';
import type { Database } from '../db/client';
import * as t from '../db/schema';
import type { Severity } from '@/components/ui/severity';
import { meetsNotificationThreshold } from '../domain/notification-routing';
import { getEmailProvider } from '../notifications/email-provider';
import { getSmsProvider } from '../notifications/sms-provider';
import { getPushProvider } from '../notifications/push-provider';

export type OutOfAppNotification = {
  severity: Severity;
  title: string;
  body: string;
  /** Chemin relatif (ex. `/maintenance?incident=…`) — rendu en URL absolue dans le message. */
  href?: string;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

/**
 * Fan-out vers les canaux hors-app choisis par chaque destinataire —
 * complément de l'écriture dans `notifications` (cloche in-app), jamais un
 * remplacement : celle-ci reste la source de vérité affichée dans l'app.
 * Chaque destinataire ne reçoit que les canaux qu'il a explicitement activés
 * dans « Mon compte », au-delà du seuil de sévérité qu'il a choisi — pas de
 * préférences enregistrées = tout désactivé, jamais l'inverse.
 *
 * Best-effort : un canal en échec (fournisseur non configuré, numéro
 * invalide, abonnement push expiré) ne bloque ni les autres destinataires ni
 * les autres canaux du même destinataire.
 */
export async function dispatchOutOfAppNotifications(
  db: Database,
  targets: { roleCodes?: readonly string[]; userIds?: readonly string[] },
  notification: OutOfAppNotification,
): Promise<void> {
  const conditions = [];
  if (targets.roleCodes?.length) conditions.push(inArray(t.roles.code, [...targets.roleCodes]));
  if (targets.userIds?.length) conditions.push(inArray(t.users.id, [...targets.userIds]));
  if (conditions.length === 0) return;

  const recipients = await db
    .select({ id: t.users.id, email: t.users.email, phoneNumber: t.users.phoneNumber })
    .from(t.users)
    .innerJoin(t.roles, eq(t.users.roleId, t.roles.id))
    .where(and(eq(t.users.isActive, true), or(...conditions)));

  if (recipients.length === 0) return;

  const preferences = await db
    .select()
    .from(t.notificationPreferences)
    .where(
      inArray(
        t.notificationPreferences.userId,
        recipients.map((recipient) => recipient.id),
      ),
    );
  const preferencesByUser = new Map(preferences.map((preference) => [preference.userId, preference]));

  const emailProvider = getEmailProvider();
  const smsProvider = getSmsProvider();
  const pushProvider = getPushProvider();

  await Promise.all(
    recipients.map(async (recipient) => {
      const preference = preferencesByUser.get(recipient.id);
      if (!preference) return;
      if (!meetsNotificationThreshold(notification.severity, preference.minSeverity)) return;

      const jobs: Promise<unknown>[] = [];

      if (preference.emailEnabled && recipient.email) {
        jobs.push(
          emailProvider.send({
            to: recipient.email,
            subject: `KS Plastico Demo — ${notification.title}`,
            text: notification.href
              ? `${notification.body}\n\n${appUrl()}${notification.href}`
              : notification.body,
          }),
        );
      }

      if (preference.smsEnabled && recipient.phoneNumber) {
        jobs.push(
          smsProvider.send({
            to: recipient.phoneNumber,
            body: `KS Plastico Demo — ${notification.title} : ${notification.body}`.slice(0, 300),
          }),
        );
      }

      if (preference.pushEnabled) {
        const subscriptions = await db
          .select()
          .from(t.pushSubscriptions)
          .where(eq(t.pushSubscriptions.userId, recipient.id));

        for (const subscription of subscriptions) {
          jobs.push(
            pushProvider
              .send(
                { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
                { title: notification.title, body: notification.body, url: notification.href },
              )
              .then(async (result) => {
                // 404/410 : abonnement mort côté navigateur — on nettoie plutôt
                // que de réessayer indéfiniment sur un endpoint qui ne répondra jamais.
                if (result.expired) {
                  await db.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.id, subscription.id));
                }
              }),
          );
        }
      }

      await Promise.all(jobs);
    }),
  );
}
