import 'server-only';

import webPush from 'web-push';
import type { PushProvider, PushSubscriptionTarget, SendResult } from './types';

/**
 * Web Push (RFC 8030/8291) via `web-push` — la seule brique ici qui
 * justifie une dépendance : le chiffrement de charge utile (ECDH + AES-GCM)
 * n'est pas quelque chose à réimplémenter à la main. Contrairement à
 * l'e-mail et au SMS, AUCUN compte tiers n'est nécessaire : les clés VAPID
 * sont une simple paire de clés auto-générée (`npx web-push
 * generate-vapid-keys`), et c'est le service push du navigateur lui-même
 * (Chrome/Firefox/Safari) qui relaie gratuitement vers l'appareil.
 */
class WebPushProvider implements PushProvider {
  readonly configured = true;

  constructor() {
    webPush.setVapidDetails(
      `mailto:${process.env.NOTIFICATION_EMAIL_FROM ?? 'contact@demo.example'}`,
      process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
    );
  }

  async send(
    subscription: PushSubscriptionTarget,
    message: { title: string; body: string; url?: string },
  ): Promise<SendResult> {
    try {
      await webPush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(message),
      );
      return { ok: true };
    } catch (error) {
      // 404/410 : l'abonnement n'est plus valide côté navigateur (désinstallation,
      // nettoyage de permissions…) — l'appelant doit le supprimer, pas réessayer.
      const statusCode = (error as { statusCode?: number })?.statusCode;
      const expired = statusCode === 404 || statusCode === 410;
      return { ok: false, expired, error: error instanceof Error ? error.message : 'Erreur push' };
    }
  }
}

class NullPushProvider implements PushProvider {
  readonly configured = false;

  async send(): Promise<SendResult> {
    console.warn('[notifications] Push non envoyé : clés VAPID absentes.');
    return { ok: false, error: 'not_configured' };
  }
}

export function getPushProvider(): PushProvider {
  if (!process.env.WEB_PUSH_VAPID_PUBLIC_KEY || !process.env.WEB_PUSH_VAPID_PRIVATE_KEY) {
    return new NullPushProvider();
  }
  return new WebPushProvider();
}
