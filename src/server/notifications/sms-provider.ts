import 'server-only';

import type { SendResult, SmsProvider } from './types';
import { isDemoMode } from '@/config/demo';

/**
 * Twilio, via son API REST directement (`fetch`, Basic Auth + formulaire
 * encodé) — même choix que pour l'e-mail : pas de SDK pour un seul appel
 * POST. Nécessite `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
 * `TWILIO_FROM_NUMBER` (voir .env.example) ; sans ça, `NullSmsProvider`
 * journalise au lieu d'échouer bruyamment.
 */
class TwilioSmsProvider implements SmsProvider {
  readonly configured = true;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
  ) {}

  async send(message: { to: string; body: string }): Promise<SendResult> {
    try {
      const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ From: this.fromNumber, To: message.to, Body: message.body }),
        },
      );

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return { ok: false, error: `Twilio ${response.status}: ${detail.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Erreur réseau' };
    }
  }
}

class NullSmsProvider implements SmsProvider {
  readonly configured = false;

  async send(): Promise<SendResult> {
    console.warn('[notifications] SMS non envoyé : identifiants Twilio absents.');
    return { ok: false, error: 'not_configured' };
  }
}

export function getSmsProvider(): SmsProvider {
  // Démonstration : aucun envoi, aucun appel sortant, quelle que soit la configuration.
  if (isDemoMode()) return new NullSmsProvider();
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return new NullSmsProvider();
  return new TwilioSmsProvider(accountSid, authToken, fromNumber);
}
