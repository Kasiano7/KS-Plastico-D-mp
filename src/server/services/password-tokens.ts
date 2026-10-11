import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  tokenExpiry,
  tokenState,
  type PasswordTokenPurpose,
} from '../domain/password-tokens';
import { getEmailProvider } from '../notifications/email-provider';

/**
 * Émission et consommation des jetons de mot de passe.
 *
 * Le jeton en clair n'existe qu'à deux instants : lors de sa génération, le
 * temps de composer le message, et lors de sa présentation par l'utilisateur.
 * En base, seul son condensat SHA-256 est conservé.
 *
 * Pourquoi SHA-256 et non bcrypt ici, alors que les mots de passe utilisent
 * bcrypt : un jeton fait 256 bits d'entropie aléatoire, il n'est pas
 * attaquable par dictionnaire. Le coût de calcul de bcrypt ne protégerait
 * rien et empêcherait la recherche par index.
 */

const TOKEN_BYTES = 32;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssuedToken = { token: string; expiresAt: Date };

/**
 * Émet un jeton et **invalide les précédents** du même motif.
 * Sans cela, dix demandes de réinitialisation laisseraient dix liens actifs.
 */
export async function issuePasswordToken(
  userId: string,
  purpose: PasswordTokenPurpose,
): Promise<IssuedToken> {
  const db = await getDb();
  const now = new Date();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = tokenExpiry(purpose, now);

  await db
    .update(t.passwordTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(t.passwordTokens.userId, userId),
        eq(t.passwordTokens.purpose, purpose),
        isNull(t.passwordTokens.usedAt),
      ),
    );

  await db.insert(t.passwordTokens).values({
    userId,
    tokenHash: hashToken(token),
    purpose,
    expiresAt,
  });

  return { token, expiresAt };
}

export type TokenLookup =
  | { ok: true; userId: string; fullName: string; purpose: PasswordTokenPurpose }
  | { ok: false; reason: 'unknown' | 'used' | 'expired' };

/** Vérifie un jeton sans le consommer — pour afficher le formulaire. */
export async function inspectPasswordToken(token: string): Promise<TokenLookup> {
  const db = await getDb();

  const [row] = await db
    .select({
      userId: t.passwordTokens.userId,
      purpose: t.passwordTokens.purpose,
      usedAt: t.passwordTokens.usedAt,
      expiresAt: t.passwordTokens.expiresAt,
      fullName: t.users.fullName,
      isActive: t.users.isActive,
    })
    .from(t.passwordTokens)
    .innerJoin(t.users, eq(t.passwordTokens.userId, t.users.id))
    .where(eq(t.passwordTokens.tokenHash, hashToken(token)))
    .limit(1);

  // Un jeton inconnu et un compte désactivé donnent la même réponse : rien à
  // apprendre pour qui teste des liens au hasard.
  if (!row || !row.isActive) return { ok: false, reason: 'unknown' };

  const state = tokenState(row, new Date());
  if (!state.usable) return { ok: false, reason: state.reason };

  return {
    ok: true,
    userId: row.userId,
    fullName: row.fullName,
    purpose: row.purpose as PasswordTokenPurpose,
  };
}

/**
 * Consomme le jeton et applique le nouveau mot de passe, dans une transaction.
 * Le marquage « utilisé » et l'écriture du mot de passe doivent réussir ou
 * échouer ensemble : sinon un jeton reste actif après un changement réussi.
 */
export async function consumePasswordToken(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean; userId?: string }> {
  const db = await getDb();
  const lookup = await inspectPasswordToken(token);
  if (!lookup.ok) return { ok: false };

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.transaction(async (tx) => {
    await tx
      .update(t.passwordTokens)
      .set({ usedAt: new Date() })
      .where(eq(t.passwordTokens.tokenHash, hashToken(token)));

    await tx
      .update(t.users)
      .set({ passwordHash })
      .where(eq(t.users.id, lookup.userId));
  });

  return { ok: true, userId: lookup.userId };
}

/** Adresse publique du lien envoyé par message. */
function passwordLink(token: string): string {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  return `${base}/mot-de-passe/${token}`;
}

export async function sendPasswordEmail(input: {
  to: string;
  fullName: string;
  token: string;
  expiresAt: Date;
  purpose: PasswordTokenPurpose;
}): Promise<{ sent: boolean }> {
  const link = passwordLink(input.token);
  const validity = input.purpose === 'reset' ? 'une heure' : 'sept jours';

  const subject =
    input.purpose === 'invitation'
      ? 'Votre accès à KS Plastico Demo'
      : 'Réinitialiser votre mot de passe KS Plastico Demo';

  const intro =
    input.purpose === 'invitation'
      ? `Bonjour ${input.fullName},\n\nUn accès à KS Plastico Demo vous a été ouvert. Définissez votre mot de passe pour l’activer :`
      : `Bonjour ${input.fullName},\n\nUne réinitialisation de mot de passe a été demandée pour votre compte KS Plastico Demo. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.`;

  const text = [
    intro,
    '',
    link,
    '',
    `Ce lien est valable ${validity} et ne fonctionne qu’une seule fois.`,
  ].join('\n');

  const provider = getEmailProvider();
  if (!provider.configured) {
    // Sans fournisseur, le lien est journalisé : l'administrateur peut le
    // transmettre à la main plutôt que de rester bloqué.
    console.info(`[mot-de-passe] Message non envoyé (aucun fournisseur). Lien pour ${input.to} :\n${link}`);
    return { sent: false };
  }

  const result = await provider.send({ to: input.to, subject, text });
  return { sent: result.ok };
}
