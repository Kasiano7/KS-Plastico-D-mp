'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { passwordPolicyIssues } from '../domain/password-policy';
import { RESET_REQUEST_ACK, TOKEN_STATE_MESSAGES } from '../domain/password-tokens';
import {
  consumePasswordToken,
  inspectPasswordToken,
  issuePasswordToken,
  sendPasswordEmail,
} from '../services/password-tokens';
import { consumeRateLimit } from '../services/rate-limit';
import { getClientIp } from '../security/client-ip';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

/**
 * Réinitialisation de mot de passe en libre-service.
 *
 * Jusqu'ici, « Mot de passe oublié ? » renvoyait vers l'administrateur. Pour
 * une usine qui tourne en trois-huit, cela veut dire qu'un opérateur de nuit
 * attend le lendemain matin pour reprendre son poste.
 *
 * Deux protections encadrent l'ouverture de ce parcours :
 *
 *   1. **La réponse ne dit jamais si le compte existe.** Sinon l'application
 *      devient un annuaire des adresses valides de l'entreprise.
 *   2. **Limitation de débit par adresse et par IP** — comme la connexion :
 *      sans elle, ce formulaire devient un moyen d'inonder une boîte.
 */

const REQUESTS_PER_EMAIL = 3;
const REQUESTS_PER_IP = 10;
const WINDOW_SECONDS = 15 * 60;

export type ResetRequestState = { message?: string; error?: string };

export async function requestPasswordResetAction(
  _state: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return { error: 'Adresse e-mail invalide.' };

  const ip = await getClientIp();
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(`reset:email:${email}`, REQUESTS_PER_EMAIL, WINDOW_SECONDS),
    consumeRateLimit(`reset:ip:${ip}`, REQUESTS_PER_IP, WINDOW_SECONDS),
  ]);

  if (!byEmail.allowed || !byIp.allowed) {
    // Même formulation neutre : le débit ne doit pas non plus révéler
    // l'existence du compte.
    return { message: RESET_REQUEST_ACK };
  }

  const db = await getDb();
  const [user] = await db
    .select({ id: t.users.id, fullName: t.users.fullName, isActive: t.users.isActive })
    .from(t.users)
    .where(eq(t.users.email, email))
    .limit(1);

  if (user && user.isActive) {
    const { token, expiresAt } = await issuePasswordToken(user.id, 'reset');
    await sendPasswordEmail({
      to: email,
      fullName: user.fullName,
      token,
      expiresAt,
      purpose: 'reset',
    });
    await recordAudit({
      userId: user.id,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });
  }

  return { message: RESET_REQUEST_ACK };
}

export type SetPasswordState = { ok?: boolean; errors?: string[] };

/**
 * Définition du mot de passe à partir d'un jeton.
 * Aucune session n'est ouverte à la fin : l'utilisateur se connecte avec son
 * nouveau mot de passe, ce qui prouve qu'il le connaît.
 */
export async function setPasswordWithTokenAction(
  _state: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '');

  if (password !== confirmation) {
    return { ok: false, errors: ['Les deux mots de passe ne correspondent pas.'] };
  }

  const lookup = await inspectPasswordToken(token);
  if (!lookup.ok) {
    return {
      ok: false,
      errors: [
        lookup.reason === 'unknown'
          ? 'Ce lien n’est pas valable.'
          : TOKEN_STATE_MESSAGES[lookup.reason],
      ],
    };
  }

  const db = await getDb();
  const [user] = await db
    .select({ email: t.users.email })
    .from(t.users)
    .where(eq(t.users.id, lookup.userId))
    .limit(1);

  const issues = passwordPolicyIssues(password, { email: user?.email });
  if (issues.length > 0) return { ok: false, errors: issues };

  const result = await consumePasswordToken(token, password);
  if (!result.ok) return { ok: false, errors: ['Ce lien n’est plus valable.'] };

  await recordAudit({
    userId: lookup.userId,
    action: 'auth.password_set',
    entityType: 'user',
    entityId: lookup.userId,
    newValue: { via: lookup.purpose },
  });

  return { ok: true };
}
