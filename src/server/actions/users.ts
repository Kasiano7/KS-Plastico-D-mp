'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { recordAudit } from '../services/audit';
import { listRoles } from '../services/roles';
import { issuePasswordToken, sendPasswordEmail } from '../services/password-tokens';
import { PASSWORD_MIN_LENGTH, passwordPolicyIssues } from '../domain/password-policy';

export type UserActionState = { ok?: boolean; message?: string; errors?: string[] };

/* ─────────────────────────────────────────────────────────────── Création ── */

const createUserSchema = z.object({
  fullName: z.string().min(2, 'Nom requis (2 caractères minimum).').max(120),
  email: z.string().email('Adresse e-mail invalide.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Mot de passe : ${PASSWORD_MIN_LENGTH} caractères minimum.`).max(200),
  roleId: z.uuid(),
});

export async function createUserAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await assertPermission('admin:write');

  const parsed = createUserSchema.safeParse({
    fullName: String(formData.get('fullName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
    roleId: formData.get('roleId'),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }

  const policyIssues = passwordPolicyIssues(parsed.data.password, { email: parsed.data.email });
  if (policyIssues.length > 0) {
    return { ok: false, errors: policyIssues };
  }

  const db = await getDb();

  const existing = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.email, parsed.data.email))
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, errors: ['Cette adresse e-mail est déjà utilisée.'] };
  }

  const roles = await listRoles();
  const role = roles.find((r) => r.id === parsed.data.roleId);
  if (!role) return { ok: false, message: 'Rôle introuvable.' };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const [user] = await db
    .insert(t.users)
    .values({
      email: parsed.data.email,
      passwordHash,
      fullName: parsed.data.fullName,
      roleId: parsed.data.roleId,
      isActive: true,
    })
    .returning();

  await recordAudit({
    userId: actor.id,
    userLabel: actor.fullName,
    action: 'user.create',
    entityType: 'user',
    entityId: user.id,
    entityLabel: parsed.data.fullName,
    newValue: { email: parsed.data.email, role: role.name },
  });

  revalidatePath('/administration');
  return { ok: true, message: `Compte « ${parsed.data.fullName} » créé.` };
}

/* ────────────────────────────────────────────── Activation / Désactivation ── */

export async function toggleUserActiveAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await assertPermission('admin:write');

  const userId = String(formData.get('userId') ?? '');
  if (!z.uuid().safeParse(userId).success) {
    return { ok: false, message: 'Utilisateur invalide.' };
  }

  const db = await getDb();
  const [target] = await db
    .select({ id: t.users.id, fullName: t.users.fullName, isActive: t.users.isActive })
    .from(t.users)
    .where(eq(t.users.id, userId))
    .limit(1);

  if (!target) return { ok: false, message: 'Utilisateur introuvable.' };

  if (target.id === actor.id && target.isActive) {
    return { ok: false, message: 'Vous ne pouvez pas désactiver votre propre compte.' };
  }

  const nextActive = !target.isActive;
  await db.update(t.users).set({ isActive: nextActive }).where(eq(t.users.id, userId));

  await recordAudit({
    userId: actor.id,
    userLabel: actor.fullName,
    action: nextActive ? 'user.activate' : 'user.deactivate',
    entityType: 'user',
    entityId: target.id,
    entityLabel: target.fullName,
    previousValue: { isActive: target.isActive },
    newValue: { isActive: nextActive },
  });

  revalidatePath('/administration');
  return {
    ok: true,
    message: nextActive ? `${target.fullName} : compte activé.` : `${target.fullName} : compte désactivé.`,
  };
}

/* ──────────────────────────────────────── Réinitialisation du mot de passe ── */

const resetPasswordSchema = z.object({
  userId: z.uuid(),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Mot de passe : ${PASSWORD_MIN_LENGTH} caractères minimum.`).max(200),
});

export async function resetUserPasswordAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await assertPermission('admin:write');

  const parsed = resetPasswordSchema.safeParse({
    userId: formData.get('userId'),
    password: String(formData.get('password') ?? ''),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }

  const db = await getDb();
  const [target] = await db
    .select({ id: t.users.id, fullName: t.users.fullName, email: t.users.email })
    .from(t.users)
    .where(eq(t.users.id, parsed.data.userId))
    .limit(1);

  if (!target) return { ok: false, message: 'Utilisateur introuvable.' };

  const policyIssues = passwordPolicyIssues(parsed.data.password, { email: target.email });
  if (policyIssues.length > 0) {
    return { ok: false, errors: policyIssues };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.update(t.users).set({ passwordHash }).where(eq(t.users.id, target.id));

  await recordAudit({
    userId: actor.id,
    userLabel: actor.fullName,
    action: 'user.password_reset',
    entityType: 'user',
    entityId: target.id,
    entityLabel: target.fullName,
  });

  revalidatePath('/administration');
  return { ok: true, message: `Mot de passe de ${target.fullName} réinitialisé.` };
}

/* ──────────────────────────────────────────────────────────── Invitation ── */

const inviteSchema = z.object({
  fullName: z.string().min(2, 'Le nom complet est requis.'),
  email: z.string().email('Adresse e-mail invalide.'),
  roleId: z.uuid('Rôle invalide.'),
});

/**
 * Invitation d'un utilisateur — sans mot de passe initial.
 *
 * Créer un compte imposait jusqu'ici à l'administrateur de choisir un mot de
 * passe pour quelqu'un d'autre, puis de le lui transmettre par un canal qui
 * n'est jamais sûr : oral, message, papier. Et ce mot de passe restait souvent
 * en place.
 *
 * L'invitation supprime ce détour : le compte naît sans identifiant utilisable,
 * et seul l'invité définit son mot de passe, via un lien à usage unique.
 */
export async function inviteUserAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await assertPermission('admin:write');

  const parsed = inviteSchema.safeParse({
    fullName: String(formData.get('fullName') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    roleId: formData.get('roleId'),
  });

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const db = await getDb();
  const existing = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.email, parsed.data.email))
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, errors: ['Cette adresse e-mail est déjà utilisée.'] };
  }

  const roles = await listRoles();
  const role = roles.find((entry) => entry.id === parsed.data.roleId);
  if (!role) return { ok: false, errors: ['Rôle introuvable.'] };

  /*
   * Le compte est créé avec un condensat d'une valeur aléatoire jamais
   * communiquée : la colonne est obligatoire, et laisser une chaîne vide ou
   * connue ouvrirait une porte. Aucun mot de passe ne permet donc d'entrer
   * tant que l'invité n'a pas utilisé son lien.
   */
  const unusablePassword = await bcrypt.hash(randomBytes(32).toString('base64'), 10);

  const [user] = await db
    .insert(t.users)
    .values({
      email: parsed.data.email,
      passwordHash: unusablePassword,
      fullName: parsed.data.fullName,
      roleId: parsed.data.roleId,
      isActive: true,
    })
    .returning();

  const { token, expiresAt } = await issuePasswordToken(user.id, 'invitation');
  const mail = await sendPasswordEmail({
    to: parsed.data.email,
    fullName: parsed.data.fullName,
    token,
    expiresAt,
    purpose: 'invitation',
  });

  await recordAudit({
    userId: actor.id,
    userLabel: actor.fullName,
    action: 'user.invite',
    entityType: 'user',
    entityId: user.id,
    entityLabel: parsed.data.fullName,
    newValue: { email: parsed.data.email, role: role.name, emailSent: mail.sent },
  });

  revalidatePath('/administration');

  return {
    ok: true,
    message: mail.sent
      ? `Invitation envoyée à ${parsed.data.email}.`
      : `Compte créé, mais aucun fournisseur d’e-mail n’est configuré : le lien d’activation figure dans les journaux du serveur.`,
  };
}

/* ────────────────────────────────────────── Désactivation en masse ──────── */

/**
 * Désactive plusieurs comptes d'un coup — un départ collectif, la fin d'une
 * mission d'intérim, la clôture d'un atelier.
 *
 * Aucune suppression : un compte désactivé conserve ses traces dans le journal
 * d'audit, ce qui est exactement l'intérêt d'un journal.
 */
export async function deactivateUsersAction(
  _state: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const actor = await assertPermission('admin:write');

  const ids = formData
    .getAll('userIds')
    .map((value) => String(value))
    .filter((value) => z.uuid().safeParse(value).success);

  if (ids.length === 0) return { ok: false, errors: ['Aucun compte sélectionné.'] };

  // Se désactiver soi-même reviendrait à se verrouiller dehors.
  const targets = ids.filter((id) => id !== actor.id);
  const selfExcluded = targets.length !== ids.length;

  if (targets.length === 0) {
    return { ok: false, errors: ['Vous ne pouvez pas désactiver votre propre compte.'] };
  }

  const db = await getDb();
  const affected = await db
    .update(t.users)
    .set({ isActive: false })
    .where(and(inArray(t.users.id, targets), eq(t.users.isActive, true)))
    .returning({ id: t.users.id, fullName: t.users.fullName });

  for (const user of affected) {
    await recordAudit({
      userId: actor.id,
      userLabel: actor.fullName,
      action: 'user.deactivate',
      entityType: 'user',
      entityId: user.id,
      entityLabel: user.fullName,
      previousValue: { isActive: true },
      newValue: { isActive: false, bulk: true },
    });
  }

  revalidatePath('/administration');

  const count = affected.length;
  return {
    ok: true,
    message:
      count === 0
        ? 'Ces comptes étaient déjà désactivés.'
        : `${count} compte${count > 1 ? 's' : ''} désactivé${count > 1 ? 's' : ''}.${
            selfExcluded ? ' Votre propre compte a été laissé actif.' : ''
          }`,
  };
}
