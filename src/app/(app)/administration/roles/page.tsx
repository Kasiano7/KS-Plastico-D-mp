import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { can } from '@/server/domain/permissions';
import { listRoles } from '@/server/services/roles';
import { PERMISSIONS } from '@/server/domain/permissions';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
  Progress,
  Table,
  Td,
  Th,
  Tr,
} from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Rôles et permissions' };
export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const user = await requirePermission('admin:read');
  const canWrite = can(user.permissions, 'admin:write');
  const roles = await listRoles();

  const totalPermissions = Object.keys(PERMISSIONS).length;
  const administrators = roles.filter((role) => role.permissions.includes('admin:write'));

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/administration"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Administration
      </Link>

      <PageHeader
        title="Rôles et permissions"
        description="Chaque rôle définit ce que ses utilisateurs peuvent consulter et modifier. Les droits sont vérifiés côté serveur à chaque page et à chaque action."
        action={
          canWrite ? (
            <ButtonLink href="/administration/roles/nouveau">
              <Plus className="size-4" />
              Nouveau rôle
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mb-5">
        <CardHeader
          title="Rôles définis"
          subtitle={`${roles.length} rôles · ${administrators.length} disposant de l’administration`}
        />
        <Table>
          <thead>
            <tr>
              <Th>Rôle</Th>
              <Th>Code</Th>
              <Th numeric>Utilisateurs</Th>
              <Th className="w-[200px]">Étendue des droits</Th>
              <Th>Nature</Th>
              <Th>Dernière modification</Th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const coverage = Math.round((role.permissions.length / totalPermissions) * 100);

              return (
                <Tr key={role.id}>
                  <Td>
                    {canWrite ? (
                      <Link
                        href={`/administration/roles/${role.id}`}
                        className="font-medium hover:text-brand"
                      >
                        {role.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{role.name}</span>
                    )}
                    {role.description ? (
                      <span className="block max-w-md text-xs text-fg-subtle">
                        {role.description}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="font-mono text-xs text-fg-subtle">{role.code}</Td>
                  <Td numeric>{role.userCount}</Td>
                  <Td>
                    <span className="tabular mb-1 block text-xs text-fg-muted">
                      {role.permissions.length} / {totalPermissions}
                    </span>
                    <Progress
                      value={coverage}
                      severity={role.permissions.includes('admin:write') ? 'warning' : 'normal'}
                      label={`Étendue des droits de ${role.name}`}
                    />
                  </Td>
                  <Td>
                    {role.isSystem ? (
                      <Badge>Livré</Badge>
                    ) : (
                      <Badge tone="brand">Personnalisé</Badge>
                    )}
                  </Td>
                  <Td className="text-xs text-fg-subtle">{formatDateTime(role.updatedAt)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Ce que KS Plastico Demo protège" />
        <ul className="space-y-2 px-5 pb-5 text-[0.8125rem] text-fg-muted">
          <li>
            • Un rôle livré avec l’application ne peut pas être supprimé, et son code technique
            reste figé — ses permissions, elles, sont modifiables.
          </li>
          <li>• Un rôle encore attribué à des utilisateurs ne peut pas être supprimé.</li>
          <li>
            • Vous ne pouvez pas retirer l’administration à votre propre rôle, ni laisser
            l’application sans aucun administrateur.
          </li>
          <li>• Chaque création, modification et suppression est inscrite au journal d’audit.</li>
        </ul>
      </Card>
    </div>
  );
}
