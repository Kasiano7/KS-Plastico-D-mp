import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { lockoutVerdict, registerFailure, registerSuccess } from '../domain/account-lockout';
import { PERMISSIONS, can, canAny, type PermissionCode } from '../domain/permissions';
import { SESSION_COOKIE_NAME, sessionCookieOptions, signSessionToken, verifySessionToken } from './jwt';
import { demoRoleEmail, isDemoMode } from '@/config/demo';
import { currentDemoRole } from '../demo/identity';

/**
 * Session applicative.
 *
 * Le cookie ne contient que l'identifiant de l'utilisateur, signé.
 * Le rôle et les permissions sont TOUJOURS relus en base à chaque requête :
 * révoquer un droit prend effet immédiatement, sans attendre l'expiration
 * d'un jeton (§45).
 *
 * Émission et vérification du jeton lui-même vivent dans `./jwt` (compatible
 * Edge, réutilisé par `middleware.ts` pour le renouvellement glissant — voir
 * ce fichier pour le détail de la rotation de session).
 */

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  /** Identifiant du rôle — nécessaire aux garde-fous d'administration. */
  roleId: string;
  /**
   * Code technique du rôle. Volontairement `string` et non une union figée :
   * les rôles sont créés depuis l'administration.
   */
  role: string;
  roleLabel: string;
  workshopId: string | null;
  employeeId: string | null;
  permissions: readonly PermissionCode[];
};

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Identifiant porté par le cookie de session signé, `null` sans session valide. */
async function sessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const verified = await verifySessionToken(token);
  return verified?.userId ?? null;
}

/**
 * Démonstration : aucun cookie de session, l'utilisateur est le compte du
 * point de vue choisi — un vrai compte du jeu de démonstration, dont les
 * droits sont relus en base exactement comme pour une session normale.
 */
async function demoUserId(): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(eq(t.users.email, demoRoleEmail(await currentDemoRole())))
    .limit(1);
  return row?.id ?? null;
}

/** Lecture de la session courante — mémoïsée pour la durée de la requête. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const userId = isDemoMode() ? await demoUserId() : await sessionUserId();
  if (!userId) return null;

  const db = await getDb();
  const rows = await db
    .select({
      id: t.users.id,
      email: t.users.email,
      fullName: t.users.fullName,
      workshopId: t.users.workshopId,
      employeeId: t.users.employeeId,
      isActive: t.users.isActive,
      roleId: t.roles.id,
      roleCode: t.roles.code,
      roleLabel: t.roles.name,
    })
    .from(t.users)
    .innerJoin(t.roles, eq(t.users.roleId, t.roles.id))
    .where(eq(t.users.id, userId))
    .limit(1);

  const user = rows[0];
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roleId: user.roleId,
    role: user.roleCode,
    roleLabel: user.roleLabel,
    workshopId: user.workshopId,
    employeeId: user.employeeId,
    permissions: await loadRolePermissions(user.roleId),
  };
});

/**
 * Permissions effectives d'un rôle, lues en base à chaque requête.
 *
 * C'est ce qui rend les rôles administrables : modifier une case dans
 * l'administration change les droits au rafraîchissement suivant, sans
 * redéploiement et sans attendre l'expiration d'une session (§45).
 *
 * Un code présent en base mais absent du catalogue applicatif est ignoré :
 * l'application ne peut vérifier que les permissions qu'elle connaît.
 */
async function loadRolePermissions(roleId: string): Promise<readonly PermissionCode[]> {
  const db = await getDb();
  const rows = await db
    .select({ code: t.permissions.code })
    .from(t.rolePermissions)
    .innerJoin(t.permissions, eq(t.rolePermissions.permissionId, t.permissions.id))
    .where(eq(t.rolePermissions.roleId, roleId));

  const known = new Set(Object.keys(PERMISSIONS));
  return rows.map((row) => row.code).filter((code): code is PermissionCode => known.has(code));
}

export type CredentialsResult =
  | { status: 'ok'; id: string; totpEnabled: boolean }
  | { status: 'invalid' }
  /** Compte verrouillé : le mot de passe n'est même pas évalué. */
  | { status: 'locked'; remainingMinutes: number };

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<CredentialsResult> {
  const db = await getDb();
  const rows = await db
    .select({
      id: t.users.id,
      passwordHash: t.users.passwordHash,
      isActive: t.users.isActive,
      totpEnabled: t.users.totpEnabled,
      failedLoginAttempts: t.users.failedLoginAttempts,
      lockedUntil: t.users.lockedUntil,
    })
    .from(t.users)
    .where(eq(t.users.email, email.trim().toLowerCase()))
    .limit(1);

  const user = rows[0];
  const now = new Date();

  // Comparaison systématique : le temps de réponse ne révèle pas si le
  // compte existe. Elle a lieu même pour un compte verrouillé, pour la même
  // raison — un verrou ne doit pas se détecter au chronomètre.
  const hash = user?.passwordHash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvaliduO';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !user.isActive) return { status: 'invalid' };

  const verdict = lockoutVerdict(
    { failedAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil },
    now,
  );
  if (verdict.locked) {
    return { status: 'locked', remainingMinutes: verdict.remainingMinutes };
  }

  if (!ok) {
    /*
     * L'échec est compté même si le compte n'était pas verrouillé : c'est ce
     * comptage consécutif qui distingue le verrouillage de la limitation de
     * débit, laquelle repart à zéro à chaque fenêtre.
     */
    const next = registerFailure(
      { failedAttempts: user.failedLoginAttempts, lockedUntil: user.lockedUntil },
      now,
    );
    await db
      .update(t.users)
      .set({ failedLoginAttempts: next.failedAttempts, lockedUntil: next.lockedUntil })
      .where(eq(t.users.id, user.id));

    return { status: 'invalid' };
  }

  const cleared = registerSuccess();
  await db
    .update(t.users)
    .set({
      lastLoginAt: now,
      failedLoginAttempts: cleared.failedAttempts,
      lockedUntil: cleared.lockedUntil,
    })
    .where(eq(t.users.id, user.id));

  return { status: 'ok', id: user.id, totpEnabled: user.totpEnabled };
}

/* ─────────────────────────────────────────────────────────────── Gardes ── */

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    // En démonstration, `/connexion` renvoie vers `/demo` : rediriger ici
    // bouclerait. Un compte de démonstration absent est une panne de données.
    if (isDemoMode()) throw new Error('Compte de démonstration introuvable : rechargez le jeu de données.');
    redirect('/connexion');
  }
  return user;
}

/**
 * Garde d'autorisation serveur. À appeler dans CHAQUE page et CHAQUE action
 * sensible : masquer un lien dans la navigation n'est pas une protection.
 */
export async function requirePermission(permission: PermissionCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.permissions, permission)) redirect('/acces-refuse');
  return user;
}

export async function requireAnyPermission(
  permissions: readonly PermissionCode[],
): Promise<SessionUser> {
  const user = await requireUser();
  if (!canAny(user.permissions, permissions)) redirect('/acces-refuse');
  return user;
}

/** Variante pour les actions serveur : lève une erreur au lieu de rediriger. */
export async function assertPermission(permission: PermissionCode): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Session expirée. Reconnectez-vous.");
  if (!can(user.permissions, permission)) {
    throw new Error("Vous n'avez pas l'autorisation d'effectuer cette action.");
  }
  return user;
}

/** Une seule des permissions listées suffit — utilisé quand plusieurs profils
 * réalisent le même geste métier (opérateur et chef d'atelier, par exemple). */
export async function assertAnyPermission(
  permissions: readonly PermissionCode[],
): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Session expirée. Reconnectez-vous.");
  if (!canAny(user.permissions, permissions)) {
    throw new Error("Vous n'avez pas l'autorisation d'effectuer cette action.");
  }
  return user;
}
