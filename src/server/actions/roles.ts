'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertPermission } from '../auth/session';
import { getDb } from '../db/client';
import * as t from '../db/schema';
import type { PermissionCode } from '../domain/permissions';
import {
  checkCodeChange,
  checkRoleDeletion,
  checkRoleUpdate,
  slugifyRoleCode,
  validateRoleDraft,
} from '../domain/roles';
import {
  buildRoleGuardContext,
  getPermissionIdsByCode,
  listRoles,
  syncPermissionCatalogue,
} from '../services/roles';
import { recordAudit } from '../services/audit';
import { demoWriteRefusal } from '../demo/guard';

export type RoleActionState = { ok?: boolean; message?: string; errors?: string[] };

const permissionSchema = z
  .array(z.string())
  .transform((codes) => [...new Set(codes)] as PermissionCode[]);

const roleFormSchema = z.object({
  name: z.string().min(1, 'Nom requis.').max(120),
  code: z.string().max(60).optional(),
  description: z.string().max(500).optional(),
  permissions: permissionSchema,
});

function readForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? '').trim(),
    code: String(formData.get('code') ?? '').trim() || undefined,
    description: String(formData.get('description') ?? '').trim() || undefined,
    permissions: formData.getAll('permissions').map(String),
  };
}

/** Remplace intégralement les permissions d'un rôle. */
async function replacePermissions(roleId: string, permissions: readonly PermissionCode[]) {
  const db = await getDb();
  const idsByCode = await getPermissionIdsByCode();

  await db.delete(t.rolePermissions).where(eq(t.rolePermissions.roleId, roleId));

  const rows = permissions
    .map((code) => idsByCode.get(code))
    .filter((id): id is string => Boolean(id))
    .map((permissionId) => ({ roleId, permissionId }));

  if (rows.length > 0) await db.insert(t.rolePermissions).values(rows);
}

/* ─────────────────────────────────────────────────────────────── Création ── */

export async function createRoleAction(
  _state: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('admin:write');
  await syncPermissionCatalogue();

  const parsed = roleFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const code = parsed.data.code ? slugifyRoleCode(parsed.data.code) : slugifyRoleCode(parsed.data.name);
  const existing = await listRoles();

  const errors = validateRoleDraft(
    { name: parsed.data.name, code, permissions: parsed.data.permissions },
    { existingCodes: existing.map((role) => role.code) },
  );
  if (errors.length > 0) return { ok: false, errors };

  const db = await getDb();
  const [role] = await db
    .insert(t.roles)
    .values({
      code,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      isSystem: false,
      rank: existing.length,
    })
    .returning();

  await replacePermissions(role.id, parsed.data.permissions);

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'role.create',
    entityType: 'role',
    entityId: role.id,
    entityLabel: role.name,
    newValue: { code, permissions: parsed.data.permissions },
  });

  revalidatePath('/administration');
  revalidatePath('/administration/roles');

  redirect(`/administration/roles/${role.id}`);
}

/* ───────────────────────────────────────────────────────────── Modification ─ */

export async function updateRoleAction(
  _state: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('admin:write');
  await syncPermissionCatalogue();

  const roleId = String(formData.get('roleId') ?? '');
  if (!z.uuid().safeParse(roleId).success) return { ok: false, message: 'Rôle invalide.' };

  const parsed = roleFormSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const roles = await listRoles();
  const role = roles.find((candidate) => candidate.id === roleId);
  if (!role) return { ok: false, message: 'Rôle introuvable.' };

  const code = role.isSystem
    ? role.code
    : slugifyRoleCode(parsed.data.code || parsed.data.name);

  const guardContext = await buildRoleGuardContext(user.roleId);
  const errors = [
    ...validateRoleDraft(
      { name: parsed.data.name, code, permissions: parsed.data.permissions },
      { existingCodes: roles.map((candidate) => candidate.code), currentCode: role.code },
    ),
    ...checkCodeChange(
      { id: role.id, code: role.code, isSystem: role.isSystem, permissions: role.permissions, userCount: role.userCount },
      code,
    ),
    ...checkRoleUpdate(roleId, parsed.data.permissions, guardContext),
  ];

  if (errors.length > 0) return { ok: false, errors };

  const db = await getDb();
  await db
    .update(t.roles)
    .set({
      code,
      name: parsed.data.name.trim(),
      description: parsed.data.description ?? null,
      updatedAt: new Date(),
    })
    .where(eq(t.roles.id, roleId));

  await replacePermissions(roleId, parsed.data.permissions);

  const added = parsed.data.permissions.filter((code) => !role.permissions.includes(code));
  const removed = role.permissions.filter((code) => !parsed.data.permissions.includes(code));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'role.update',
    entityType: 'role',
    entityId: roleId,
    entityLabel: parsed.data.name.trim(),
    previousValue: { name: role.name, permissions: role.permissions },
    newValue: { name: parsed.data.name.trim(), permissions: parsed.data.permissions },
    justification:
      added.length + removed.length > 0
        ? `Ajoutées : ${added.join(', ') || 'aucune'} · Retirées : ${removed.join(', ') || 'aucune'}`
        : 'Aucun changement de permission',
  });

  revalidatePath('/administration');
  revalidatePath('/administration/roles');
  revalidatePath(`/administration/roles/${roleId}`);

  return {
    ok: true,
    message:
      added.length + removed.length > 0
        ? `Rôle mis à jour : ${added.length} permission(s) ajoutée(s), ${removed.length} retirée(s). Les utilisateurs concernés verront le changement à leur prochaine navigation.`
        : 'Rôle mis à jour.',
  };
}

/* ─────────────────────────────────────────────────────────────── Suppression ─ */

export async function deleteRoleAction(
  _state: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const user = await assertPermission('admin:write');

  const roleId = String(formData.get('roleId') ?? '');
  if (!z.uuid().safeParse(roleId).success) return { ok: false, message: 'Rôle invalide.' };

  const roles = await listRoles();
  const role = roles.find((candidate) => candidate.id === roleId);
  if (!role) return { ok: false, message: 'Rôle introuvable.' };

  const guardContext = await buildRoleGuardContext(user.roleId);
  const errors = checkRoleDeletion(roleId, guardContext);
  if (errors.length > 0) return { ok: false, errors };

  const db = await getDb();
  await db.delete(t.roles).where(eq(t.roles.id, roleId));

  await recordAudit({
    userId: user.id,
    userLabel: user.fullName,
    action: 'role.delete',
    entityType: 'role',
    entityId: roleId,
    entityLabel: role.name,
    previousValue: { code: role.code, permissions: role.permissions },
  });

  revalidatePath('/administration');
  revalidatePath('/administration/roles');

  redirect('/administration/roles');
}

/* ──────────────────────────────────────────────── Affectation d'un rôle ───── */

const assignSchema = z.object({ userId: z.uuid(), roleId: z.uuid() });

/** Change le rôle d'un utilisateur — la contrepartie indispensable de la création. */
export async function assignRoleAction(
  _state: RoleActionState,
  formData: FormData,
): Promise<RoleActionState> {
  const refused = demoWriteRefusal();
  if (refused) return refused;
  const actor = await assertPermission('admin:write');

  const parsed = assignSchema.safeParse({
    userId: formData.get('userId'),
    roleId: formData.get('roleId'),
  });
  if (!parsed.success) return { ok: false, message: 'Requête invalide.' };

  const db = await getDb();
  const [target] = await db
    .select({
      id: t.users.id,
      fullName: t.users.fullName,
      roleId: t.users.roleId,
      roleName: t.roles.name,
    })
    .from(t.users)
    .innerJoin(t.roles, eq(t.users.roleId, t.roles.id))
    .where(eq(t.users.id, parsed.data.userId))
    .limit(1);

  if (!target) return { ok: false, message: 'Utilisateur introuvable.' };
  if (target.roleId === parsed.data.roleId) {
    return { ok: false, message: 'Cet utilisateur porte déjà ce rôle.' };
  }

  const roles = await listRoles();
  const nextRole = roles.find((role) => role.id === parsed.data.roleId);
  if (!nextRole) return { ok: false, message: 'Rôle introuvable.' };

  // Se retirer à soi-même l'administration par changement de rôle produirait
  // exactement le verrouillage que les garde-fous cherchent à éviter.
  if (
    target.id === actor.id &&
    !nextRole.permissions.includes('admin:write')
  ) {
    return {
      ok: false,
      errors: [
        "Vous ne pouvez pas vous attribuer un rôle sans droit d'administration : vous perdriez l'accès à cette page.",
      ],
    };
  }

  // Effectif de chaque rôle une fois le déplacement appliqué.
  const stillHasAdministrator = roles.some((role) => {
    const countAfter =
      role.userCount -
      (role.id === target.roleId ? 1 : 0) +
      (role.id === parsed.data.roleId ? 1 : 0);
    return role.permissions.includes('admin:write') && countAfter > 0;
  });

  if (!stillHasAdministrator) {
    return {
      ok: false,
      errors: ["Ce changement retirerait le dernier administrateur de l'application."],
    };
  }

  await db
    .update(t.users)
    .set({ roleId: parsed.data.roleId })
    .where(eq(t.users.id, parsed.data.userId));

  await recordAudit({
    userId: actor.id,
    userLabel: actor.fullName,
    action: 'user.role_change',
    entityType: 'user',
    entityId: target.id,
    entityLabel: target.fullName,
    previousValue: { role: target.roleName },
    newValue: { role: nextRole.name },
  });

  revalidatePath('/administration');
  revalidatePath('/administration/roles');

  return { ok: true, message: `${target.fullName} porte désormais le rôle « ${nextRole.name} ».` };
}
