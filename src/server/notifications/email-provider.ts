import 'server-only';

import type { EmailProvider, SendResult } from './types';
import { isDemoMode } from '@/config/demo';

/**
 * Resend, via son API REST directement (`fetch`) — pas de SDK : c'est un
 * seul appel POST, une dépendance de plus n'aurait rien apporté. Nécessite
 * `RESEND_EMAIL_API_KEY` (voir .env.example) ; sans clé, `NullEmailProvider`
 * prend le relais et journalise au lieu d'échouer bruyamment.
 */
class ResendEmailProvider implements EmailProvider {
  readonly configured = true;

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async send(message: { to: string; subject: string; text: string }): Promise<SendResult> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { ok: false, error: `Resend ${response.status}: ${detail.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erreur réseau' };
    }
  }
}

class NullEmailProvider implements EmailProvider {
  readonly configured = false;

  async send(): Promise<SendResult> {
    console.warn('[notifications] Email non envoyé : RESEND_EMAIL_API_KEY absent.');
    return { ok: false, error: 'not_configured' };
  }
}

export function getEmailProvider(): EmailProvider {
  // Démonstration : aucun envoi, aucun appel sortant, quelle que soit la configuration.
  if (isDemoMode()) return new NullEmailProvider();
  const apiKey = process.env.RESEND_EMAIL_API_KEY;
  const fromAddress = process.env.NOTIFICATION_EMAIL_FROM;
  if (!apiKey || !fromAddress) return new NullEmailProvider();
  return new ResendEmailProvider(apiKey, fromAddress);
}
