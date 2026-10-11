import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import { PERMISSIONS, type PermissionCode } from '../domain/permissions';
import type { RoleGuardContext, RoleSnapshot } from '../domain/roles';

/**
 * Lecture des rôles pour l'administration.
 *
 * Les permissions renvoyées viennent de `role_permissions`, jamais du
 * catalogue de code : c'est l'état réel qui est administré.
 */

export type RoleWithPermissions = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  rank: number;
  createdAt: Date;
  updatedAt: Date;
  permissions: PermissionCode[];
  userCount: number;
};

const KNOWN_PERMISSIONS = new Set(Object.keys(PERMISSIONS));

export async function listRoles(): Promise<RoleWithPermissions[]> {
  const db = await getDb();

  const [roleRows, permissionRows, userCounts] = await Promise.all([
    db.select().from(t.roles).orderBy(asc(t.roles.rank), asc(t.roles.name)),
    db
      .select({ roleId: t.rolePermissions.roleId, code: t.permissions.code })
      .from(t.rolePermissions)
      .innerJoin(t.permissions, eq(t.rolePermissions.permissionId, t.permissions.id)),
    db
      .select({ roleId: t.users.roleId, total: sql<number>`count(*)::int` })
      .from(t.users)
      .where(eq(t.users.isActive, true))
      .groupBy(t.users.roleId),
  ]);

  return roleRows.map((role) => ({
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    rank: role.rank,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: permissionRows
      .filter((row) => row.roleId === role.id)
      .map((row) => row.code)
      .filter((code): code is PermissionCode => KNOWN_PERMISSIONS.has(code))
      .sort(),
    userCount: userCounts.find((row) => row.roleId === role.id)?.total ?? 0,
  }));
}

export async function getRole(roleId: string): Promise<RoleWithPermissions | null> {
  const roles = await listRoles();
  return roles.find((role) => role.id === roleId) ?? null;
}

/**
 * Contexte transmis aux garde-fous du domaine : l'état complet des rôles est
 * nécessaire pour savoir si une modification laisserait l'usine sans
 * administrateur.
 */
export async function buildRoleGuardContext(editorRoleId: string): Promise<RoleGuardContext> {
  const roles = await listRoles();

  return {
    editorRoleId,
    roles: roles.map<RoleSnapshot>((role) => ({
      id: role.id,
      code: role.code,
      isSystem: role.isSystem,
      permissions: role.permissions,
      userCount: role.userCount,
    })),
  };
}

/** Table `permissions` indexée par code, pour convertir des codes en identifiants. */
export async function getPermissionIdsByCode(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.select({ id: t.permissions.id, code: t.permissions.code }).from(t.permissions);
  return new Map(rows.map((row) => [row.code, row.id]));
}

/**
 * Garantit que chaque permission du catalogue applicatif existe en base.
 * Utile après l'ajout d'une permission dans le code : l'administration doit
 * pouvoir la cocher sans attendre un rechargement du seed.
 */
export async function syncPermissionCatalogue(): Promise<void> {
  const db = await getDb();
  const existing = await getPermissionIdsByCode();

  const missing = (Object.keys(PERMISSIONS) as PermissionCode[])
    .filter((code) => !existing.has(code))
    .map((code) => ({
      code,
      domain: code.split(':')[0],
      description: PERMISSIONS[code],
    }));

  if (missing.length > 0) await db.insert(t.permissions).values(missing);
}
