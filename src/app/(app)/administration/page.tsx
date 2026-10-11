import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { ShieldCheck } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { getDb, getDbDriver } from '@/server/db/client';
import * as t from '@/server/db/schema';
import { PERMISSIONS, can, type PermissionCode } from '@/server/domain/permissions';
import { DOMAIN_LABELS, groupPermissionsByDomain } from '@/server/domain/roles';
import { listRoles, syncPermissionCatalogue } from '@/server/services/roles';
import { UserRoleSelect } from '@/components/factory/user-role-select';
import { UserCreateDialog } from '@/components/factory/user-create-dialog';
import { UserInviteDialog } from '@/components/factory/user-invite-dialog';
import { UserBulkDeactivate } from '@/components/factory/user-bulk-deactivate';
import { RoleAuditTrail } from '@/components/factory/role-audit-trail';
import { UserToggleActive } from '@/components/factory/user-toggle-active';
import { UserResetPasswordDialog } from '@/components/factory/user-reset-password-dialog';
import { CostModelEditDialog } from '@/components/factory/cost-model-edit-dialog';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Administration' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const currentUser = await requirePermission('admin:read');
  const canWrite = can(currentUser.permissions, 'admin:write');

  await syncPermissionCatalogue();

  const db = await getDb();
  const driver = await getDbDriver();

  const [users, costModels, roles, lastAudit] = await Promise.all([
    db
      .select({
        id: t.users.id,
        email: t.users.email,
        fullName: t.users.fullName,
        isActive: t.users.isActive,
        lastLoginAt: t.users.lastLoginAt,
        roleId: t.roles.id,
        roleName: t.roles.name,
        workshopName: t.workshops.name,
      })
      .from(t.users)
      .innerJoin(t.roles, eq(t.users.roleId, t.roles.id))
      .leftJoin(t.workshops, eq(t.users.workshopId, t.workshops.id))
      .orderBy(t.roles.rank),
    db.select().from(t.costModels),
    listRoles(),
    db
      .select({ occurredAt: t.auditLogs.occurredAt })
      .from(t.auditLogs)
      .orderBy(desc(t.auditLogs.occurredAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const permissionCodes = Object.keys(PERMISSIONS) as PermissionCode[];
  const groups = groupPermissionsByDomain();
  const roleOptions = roles.map((role) => ({ id: role.id, name: role.name }));

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Administration"
        description="Utilisateurs, rôles, matrice de permissions et paramètres de calcul."
        action={
          <ButtonLink href="/administration/roles" variant="secondary">
            <ShieldCheck className="size-4" />
            Gérer les rôles
          </ButtonLink>
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="Utilisateurs"
          subtitle={
            canWrite
              ? `${activeCount} actif(s) sur ${users.length} — rôle modifiable directement dans le tableau`
              : `${activeCount} actif(s) sur ${users.length}`
          }
          action={
            canWrite ? (
              <div className="flex items-center gap-2">
                <UserInviteDialog roles={roleOptions} />
                <UserCreateDialog roles={roleOptions} />
              </div>
            ) : null
          }
        />
        <UserBulkDeactivate>
        <Table>
          <thead>
            <tr>
              {canWrite ? <Th aria-label="Sélection" /> : null}
              <Th>Nom</Th>
              <Th>Adresse e-mail</Th>
              <Th>Rôle</Th>
              <Th>Périmètre</Th>
              <Th>Dernière connexion</Th>
              <Th>État</Th>
              {canWrite ? <Th>Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Tr key={user.id}>
                {canWrite ? (
                  <Td className="w-8">
                    {/*
                      Un compte déjà désactivé n'est pas sélectionnable : la
                      case cochée ne produirait rien.
                    */}
                    <input
                      type="checkbox"
                      name="userIds"
                      value={user.id}
                      disabled={!user.isActive}
                      aria-label={`Sélectionner ${user.fullName}`}
                      className="size-4 rounded border-line-strong accent-brand disabled:opacity-30"
                    />
                  </Td>
                ) : null}
                <Td className="font-medium">{user.fullName}</Td>
                <Td className="font-mono text-xs text-fg-muted">{user.email}</Td>
                <Td>
                  {canWrite ? (
                    <UserRoleSelect
                      userId={user.id}
                      currentRoleId={user.roleId}
                      roles={roleOptions}
                    />
                  ) : (
                    <span className="text-fg-muted">{user.roleName}</span>
                  )}
                </Td>
                <Td className="text-fg-muted">{user.workshopName ?? 'Usine entière'}</Td>
                <Td className="text-xs text-fg-subtle">
                  {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Jamais'}
                </Td>
                <Td>
                  <Badge tone={user.isActive ? 'brand' : 'neutral'}>
                    {user.isActive ? 'Actif' : 'Désactivé'}
                  </Badge>
                </Td>
                {canWrite ? (
                  <Td>
                    <div className="flex items-start gap-1">
                      <UserToggleActive userId={user.id} isActive={user.isActive} />
                      <UserResetPasswordDialog userId={user.id} userName={user.fullName} />
                    </div>
                  </Td>
                ) : null}
              </Tr>
            ))}
          </tbody>
        </Table>
        </UserBulkDeactivate>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Matrice des permissions"
          subtitle="État réel lu en base — vérifié côté serveur à chaque page et à chaque mutation"
          action={
            canWrite ? (
              <Link href="/administration/roles" className="text-xs font-medium text-brand hover:underline">
                Modifier les rôles
              </Link>
            ) : null
          }
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-line px-3 py-2 text-left text-[0.6875rem] font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    className="border-b border-line px-2 py-2 text-center text-[0.625rem] font-semibold text-fg-subtle"
                  >
                    {canWrite ? (
                      <Link href={`/administration/roles/${role.id}`} className="hover:text-brand">
                        {role.name}
                      </Link>
                    ) : (
                      role.name
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.domain}>
                  <tr>
                    <td
                      colSpan={roles.length + 1}
                      className="border-b border-line bg-surface-sunken px-3 py-1.5 text-[0.625rem] font-semibold tracking-[0.1em] text-fg-subtle uppercase"
                    >
                      {DOMAIN_LABELS[group.domain] ?? group.domain}
                    </td>
                  </tr>
                  {group.permissions.map((code) => (
                    <tr key={code}>
                      <td className="border-b border-line px-3 py-1.5">
                        <span className="font-mono text-xs text-fg">{code}</span>
                        <span className="block text-[0.6875rem] text-fg-subtle">
                          {PERMISSIONS[code]}
                        </span>
                      </td>
                      {roles.map((role) => (
                        <td
                          key={role.id}
                          className="border-b border-line px-2 py-1.5 text-center"
                          title={`${role.name} — ${PERMISSIONS[code]}`}
                        >
                          {role.permissions.includes(code) ? (
                            <span className="text-normal" aria-label="autorisé">
                              ●
                            </span>
                          ) : (
                            <span className="text-fg-subtle/35" aria-label="refusé">
                              ○
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Le journal des rôles se lit juste après la matrice : on y voit
          l’état actuel, puis comment on y est arrivé. */}
      <RoleAuditTrail />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Rôles"
            subtitle="Périmètre fonctionnel de chaque profil"
            action={
              canWrite ? (
                <ButtonLink href="/administration/roles/nouveau" variant="secondary" size="sm">
                  Nouveau rôle
                </ButtonLink>
              ) : null
            }
          />
          <ul className="space-y-3 px-5 pb-5">
            {roles.map((role) => (
              <li key={role.id}>
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-medium text-fg">
                  {canWrite ? (
                    <Link href={`/administration/roles/${role.id}`} className="hover:text-brand">
                      {role.name}
                    </Link>
                  ) : (
                    role.name
                  )}
                  {role.isSystem ? null : <Badge tone="brand">Personnalisé</Badge>}
                </p>
                {role.description ? (
                  <p className="text-[0.8125rem] text-fg-muted">{role.description}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {role.permissions.length} permission(s) sur {permissionCodes.length} ·{' '}
                  {role.userCount} utilisateur(s)
                </p>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Modèle de coût" subtitle="Base de tous les calculs d'impact financier" />
            {costModels.map((model) => (
              <dl key={model.id} className="grid grid-cols-2 gap-3 px-5 pb-5 text-[0.8125rem]">
                <div className="col-span-2 flex items-start justify-between gap-3">
                  <div>
                    <dt className="text-fg-subtle">Modèle</dt>
                    <dd className="font-medium text-fg">
                      {model.name} {model.isDefault ? '· par défaut' : ''}
                    </dd>
                  </div>
                  {canWrite ? <CostModelEditDialog model={model} /> : null}
                </div>
                {[
                  ['Énergie', model.energyCentsPerHour],
                  ["Main-d’œuvre", model.laborCentsPerHour],
                  ['Frais généraux', model.overheadCentsPerHour],
                  ['Consommables', model.consumablesCentsPerHour],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-fg-subtle">{label} / h</dt>
                    <dd className="tabular font-medium text-fg">
                      {((value as number) / 100).toLocaleString('fr-FR')} €
                    </dd>
                  </div>
                ))}
              </dl>
            ))}
          </Card>

          <Card>
            <CardHeader
              title="Système"
              subtitle="État technique de l'instance"
              action={
                canWrite ? (
                  <Link
                    href="/historique"
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Journal d&apos;audit
                  </Link>
                ) : null
              }
            />
            <dl className="space-y-2 px-5 pb-5 text-[0.8125rem]">
              <div className="flex justify-between">
                <dt className="text-fg-muted">Base de données</dt>
                <dd className="font-mono text-xs text-fg">{driver}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Utilisateurs</dt>
                <dd className="font-mono text-xs text-fg">
                  {activeCount} actif(s) / {users.length} total
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-fg-muted">Rôles</dt>
                <dd className="font-mono text-xs text-fg">
                  {roles.length} dont {roles.filter((role) => !role.isSystem).length} personnalisé(s)
                </dd>
              </div>
              {lastAudit ? (
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Dernier événement</dt>
                  <dd className="font-mono text-xs text-fg">{formatDateTime(lastAudit.occurredAt)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-fg-muted">Télémétrie machine</dt>
                <dd className="font-mono text-xs text-fg">simulée</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
