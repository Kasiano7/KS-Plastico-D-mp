import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { groupPermissionsByDomain } from '@/server/domain/roles';
import { getRole, syncPermissionCatalogue } from '@/server/services/roles';
import { listAuditLogsForEntity } from '@/server/services/audit';
import { DeleteRoleForm, RoleEditor } from '@/components/factory/role-editor';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const role = await getRole((await params).id);
  return { title: role ? `Rôle ${role.name}` : 'Rôle' };
}

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('admin:write');
  await syncPermissionCatalogue();

  const { id } = await params;
  const role = await getRole(id);
  if (!role) notFound();

  const history = await listAuditLogsForEntity('role', role.id);

  return (
    <div className="mx-auto max-w-[900px]">
      <Link
        href="/administration/roles"
        className="mb-4 inline-flex items-center gap-1 text-[0.8125rem] text-fg-muted hover:text-fg"
      >
        <ChevronLeft className="size-3.5" />
        Rôles et permissions
      </Link>

      <PageHeader
        title={role.name}
        description={
          role.userCount > 0
            ? `${role.userCount} utilisateur(s) portent ce rôle. Toute modification prend effet à leur prochaine navigation.`
            : 'Aucun utilisateur ne porte encore ce rôle.'
        }
      />

      <RoleEditor
        role={{
          id: role.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          permissions: role.permissions,
          userCount: role.userCount,
        }}
        groups={groupPermissionsByDomain()}
        mode="edit"
      />

      {!role.isSystem ? <DeleteRoleForm roleId={role.id} roleName={role.name} /> : null}

      {history.length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="Historique du rôle" subtitle="Toute modification de droits est tracée" />
          <ul className="space-y-2.5 px-5 pb-5">
            {history.map((log) => (
              <li key={log.id} className="text-[0.8125rem]">
                <span className="text-fg">{log.action}</span>
                <span className="block text-xs text-fg-subtle">
                  {log.userLabel ?? 'Système'} · {formatDateTime(log.occurredAt)}
                  {log.justification ? ` · ${log.justification}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
