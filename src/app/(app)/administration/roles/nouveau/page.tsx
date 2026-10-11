import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requirePermission } from '@/server/auth/session';
import { groupPermissionsByDomain } from '@/server/domain/roles';
import { syncPermissionCatalogue } from '@/server/services/roles';
import { RoleEditor } from '@/components/factory/role-editor';
import { PageHeader } from '@/components/ui/primitives';

export const metadata: Metadata = { title: 'Nouveau rôle' };
export const dynamic = 'force-dynamic';

export default async function NewRolePage() {
  await requirePermission('admin:write');
  // Une permission ajoutée dans le code doit être cochable immédiatement.
  await syncPermissionCatalogue();

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
        title="Nouveau rôle"
        description="Définissez un périmètre sur mesure. Le rôle sera immédiatement attribuable depuis la liste des utilisateurs."
      />

      <RoleEditor role={null} groups={groupPermissionsByDomain()} mode="create" />
    </div>
  );
}
