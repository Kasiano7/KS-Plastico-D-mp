'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  createSession,
  destroySession,
  getCurrentUser,
  verifyCredentials,
} from '../auth/session';
import { landingHrefFor } from '@/config/navigation';
import { lockoutMessage } from '../domain/account-lockout';
import {
  TWO_FACTOR_PENDING_COOKIE_NAME,
  signTwoFactorPendingToken,
  twoFactorPendingCookieOptions,
  verifyTwoFactorPendingToken,
} from '../auth/jwt';
import { verifyLoginCode } from '../services/two-factor';
import { recordAudit } from '../services/audit';
import { consumeRateLimit } from '../services/rate-limit';
import { getClientIp } from '../security/client-ip';
import { demoWriteRefusal } from '../demo/guard';

const credentialsSchema = z.object({
  email: z.email("Adresse e-mail invalide."),
  password: z.string().min(1, 'Mot de passe requis.'),
});

export type LoginState = { error?: string; requiresTwoFactor?: boolean };

/**
 * Limites volontairement larges pour ne jamais gêner un usage légitime :
 * l'objectif est de casser un essai systématique (credential stuffing), pas
 * de compter les fautes de frappe d'un opérateur pressé.
 */
const LOGIN_ATTEMPTS_PER_EMAIL = 8;
const LOGIN_ATTEMPTS_PER_IP = 20;
const LOGIN_WINDOW_SECONDS = 10 * 60;

/**
 * Étape 1 : mot de passe. Si le compte a la 2FA active, ne pose PAS de
 * session — un jeton intermédiaire de 5 minutes (§ jwt.ts) porte juste
 * l'identité vérifiée jusqu'à l'étape 2 (`verifyTwoFactorLoginAction`).
 */
export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Identifiants invalides.' };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const ip = await getClientIp();
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(`login:email:${email}`, LOGIN_ATTEMPTS_PER_EMAIL, LOGIN_WINDOW_SECONDS),
    consumeRateLimit(`login:ip:${ip}`, LOGIN_ATTEMPTS_PER_IP, LOGIN_WINDOW_SECONDS),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    // Message générique : ne révèle ni quel compte est visé, ni lequel des
    // deux compteurs (email ou IP) a déclenché le blocage.
    return { error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  }

  const result = await verifyCredentials(parsed.data.email, parsed.data.password);

  if (result.status === 'locked') {
    // Formulation identique à celle du dépassement de débit : le verrou ne
    // doit pas non plus révéler qu'un compte existe à cette adresse.
    return { error: lockoutMessage(result.remainingMinutes) };
  }

  if (result.status === 'invalid') {
    // Message volontairement générique : ne pas révéler l'existence d'un compte.
    return { error: 'Identifiants incorrects.' };
  }

  const user = result;

  if (user.totpEnabled) {
    const pendingToken = await signTwoFactorPendingToken(user.id);
    const store = await cookies();
    store.set(TWO_FACTOR_PENDING_COOKIE_NAME, pendingToken, twoFactorPendingCookieOptions());
    return { requiresTwoFactor: true };
  }

  await createSession(user.id);
  await recordAudit({
    userId: user.id,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
  });

  return redirectAfterLogin();
}

/**
 * Écran d'arrivée après authentification.
 *
 * Un opérateur n'a pas accès au tableau de bord d'usine : le rediriger vers
 * `/` l'envoyait droit sur « Accès refusé » juste après une connexion réussie.
 * Les permissions ne sont connues qu'une fois la session créée, d'où cette
 * relecture.
 */
async function redirectAfterLogin(): Promise<never> {
  const user = await getCurrentUser();
  redirect(user ? landingHrefFor(user.permissions) : '/');
}

const TWO_FACTOR_ATTEMPTS_PER_ACCOUNT = 8;
const TWO_FACTOR_WINDOW_SECONDS = 10 * 60;

/**
 * Étape 2 : code TOTP ou code de secours. Un code à 6 chiffres n'a qu'un
 * million de combinaisons — sans limitation de débit ici, la 2FA ne
 * protégerait quasiment rien contre un essai systématique.
 */
export async function verifyTwoFactorLoginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const store = await cookies();
  const pendingToken = store.get(TWO_FACTOR_PENDING_COOKIE_NAME)?.value;
  const pending = pendingToken ? await verifyTwoFactorPendingToken(pendingToken) : null;

  if (!pending) {
    return { error: 'Session de connexion expirée. Recommencez depuis le début.' };
  }

  const code = String(formData.get('code') ?? '').trim();
  if (!code) {
    return { error: 'Code requis.', requiresTwoFactor: true };
  }

  const rateLimit = await consumeRateLimit(
    `2fa-verify:${pending.userId}`,
    TWO_FACTOR_ATTEMPTS_PER_ACCOUNT,
    TWO_FACTOR_WINDOW_SECONDS,
  );
  if (!rateLimit.allowed) {
    return { error: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  }

  const result = await verifyLoginCode(pending.userId, code);
  if (!result.ok) {
    return { error: 'Code invalide.', requiresTwoFactor: true };
  }

  store.delete(TWO_FACTOR_PENDING_COOKIE_NAME);
  await createSession(pending.userId);
  await recordAudit({
    userId: pending.userId,
    action: 'auth.login',
    entityType: 'user',
    entityId: pending.userId,
    newValue: result.usedRecoveryCode ? { via: 'recovery_code' } : { via: 'totp' },
  });

  return redirectAfterLogin();
}

export async function logoutAction(): Promise<void> {
  // En démonstration, il n'y a pas de session à fermer : retour à l'accueil de la démo.
  if (demoWriteRefusal()) redirect('/demo');
  await destroySession();
  redirect('/connexion');
}
