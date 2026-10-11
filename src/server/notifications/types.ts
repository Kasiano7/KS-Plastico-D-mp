/**
 * Contrats des canaux de notification hors-app — même logique que
 * `server/ai/types.ts` : une interface stable, plusieurs implémentations
 * (fournisseur réel si configuré, `Null…` sinon), jamais de branchement
 * `if (provider === 'x')` dispersé dans l'appelant.
 */

export type SendResult = { ok: boolean; error?: string; expired?: boolean };

export interface EmailProvider {
  readonly configured: boolean;
  send(message: { to: string; subject: string; text: string }): Promise<SendResult>;
}

export interface SmsProvider {
  readonly configured: boolean;
  send(message: { to: string; body: string }): Promise<SendResult>;
}

export type PushSubscriptionTarget = { endpoint: string; p256dh: string; auth: string };

export interface PushProvider {
  readonly configured: boolean;
  send(subscription: PushSubscriptionTarget, message: { title: string; body: string; url?: string }): Promise<SendResult>;
}
