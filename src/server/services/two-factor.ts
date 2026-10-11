import 'server-only';

import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import {
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotpCode,
} from '../domain/totp';

/**
 * Orchestration de la double authentification (§ SECURITY.md « Reste à
 * durcir »). Le calcul TOTP lui-même est pur et vit dans `server/domain/totp`
 * (§ règle 1 de CLAUDE.md) — ce module ne fait que la lecture/écriture base
 * et l'assemblage.
 */

export type EnrollmentStart = {
  secretBase32: string;
  otpAuthUri: string;
  qrDataUrl: string;
};

/**
 * Démarre (ou redémarre) un enrôlement : génère un nouveau secret et
 * l'enregistre SANS activer la 2FA — `totpEnabled` ne passe à vrai qu'après
 * vérification d'un premier code dans `confirmEnrollment`. Un enrôlement non
 * confirmé écrase silencieusement le précédent : c'est le comportement voulu
 * (l'utilisateur a scanné un nouveau QR, l'ancien secret est mort).
 */
export async function beginEnrollment(userId: string, accountEmail: string): Promise<EnrollmentStart> {
  const db = await getDb();
  const secretBase32 = generateTotpSecret();

  await db.update(t.users).set({ totpSecret: secretBase32, totpEnabled: false }).where(eq(t.users.id, userId));

  const otpAuthUri = buildOtpAuthUri({ secretBase32, accountLabel: accountEmail });
  const qrDataUrl = await QRCode.toDataURL(otpAuthUri, { margin: 1, width: 240 });

  return { secretBase32, otpAuthUri, qrDataUrl };
}

/**
 * Confirme l'enrôlement avec un premier code valide, active la 2FA, et
 * (re)génère les codes de secours — retournés en clair une seule fois, ici :
 * seul leur hachage est conservé en base, comme un mot de passe.
 */
export async function confirmEnrollment(
  userId: string,
  code: string,
): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const db = await getDb();
  const [user] = await db
    .select({ totpSecret: t.users.totpSecret })
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);

  if (!user?.totpSecret) {
    return { ok: false, error: "Aucun enrôlement en cours — relancez la configuration." };
  }
  if (!verifyTotpCode(user.totpSecret, code, Date.now())) {
    return { ok: false, error: 'Code invalide. Vérifiez l’heure de votre téléphone et réessayez.' };
  }

  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await db.transaction(async (tx) => {
    await tx.update(t.users).set({ totpEnabled: true }).where(eq(t.users.id, userId));
    // Un nouvel enrôlement invalide les anciens codes de secours.
    await tx.delete(t.twoFactorRecoveryCodes).where(eq(t.twoFactorRecoveryCodes.userId, userId));
    await tx.insert(t.twoFactorRecoveryCodes).values(
      recoveryHashes.map((codeHash) => ({ userId, codeHash })),
    );
  });

  return { ok: true, recoveryCodes };
}

/** Désactive la 2FA et purge secret + codes de secours — retour à un compte mot de passe seul. */
export async function disableTwoFactor(userId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(t.users).set({ totpSecret: null, totpEnabled: false }).where(eq(t.users.id, userId));
    await tx.delete(t.twoFactorRecoveryCodes).where(eq(t.twoFactorRecoveryCodes.userId, userId));
  });
}

/**
 * Vérifie un code au moment de la connexion — TOTP d'abord, code de secours
 * ensuite. Un code de secours n'est consommable qu'une fois : il est marqué
 * utilisé, jamais supprimé (traçabilité — § règle 8, tout doit rester
 * auditable).
 */
export async function verifyLoginCode(
  userId: string,
  code: string,
): Promise<{ ok: boolean; usedRecoveryCode: boolean }> {
  const db = await getDb();
  const [user] = await db
    .select({ totpSecret: t.users.totpSecret, totpEnabled: t.users.totpEnabled })
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);

  if (!user?.totpEnabled || !user.totpSecret) return { ok: false, usedRecoveryCode: false };

  if (verifyTotpCode(user.totpSecret, code, Date.now())) {
    return { ok: true, usedRecoveryCode: false };
  }

  const normalized = code.trim().toUpperCase();
  const unusedCodes = await db
    .select({ id: t.twoFactorRecoveryCodes.id, codeHash: t.twoFactorRecoveryCodes.codeHash })
    .from(t.twoFactorRecoveryCodes)
    .where(and(eq(t.twoFactorRecoveryCodes.userId, userId), isNull(t.twoFactorRecoveryCodes.usedAt)));

  for (const recoveryCode of unusedCodes) {
    if (await bcrypt.compare(normalized, recoveryCode.codeHash)) {
      await db
        .update(t.twoFactorRecoveryCodes)
        .set({ usedAt: new Date() })
        .where(eq(t.twoFactorRecoveryCodes.id, recoveryCode.id));
      return { ok: true, usedRecoveryCode: true };
    }
  }

  return { ok: false, usedRecoveryCode: false };
}

export async function getTwoFactorStatus(
  userId: string,
): Promise<{ enabled: boolean; remainingRecoveryCodes: number }> {
  const db = await getDb();
  const [user] = await db
    .select({ totpEnabled: t.users.totpEnabled })
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);

  const unusedCodes = await db
    .select({ id: t.twoFactorRecoveryCodes.id })
    .from(t.twoFactorRecoveryCodes)
    .where(and(eq(t.twoFactorRecoveryCodes.userId, userId), isNull(t.twoFactorRecoveryCodes.usedAt)));

  return { enabled: user?.totpEnabled ?? false, remainingRecoveryCodes: unusedCodes.length };
}
